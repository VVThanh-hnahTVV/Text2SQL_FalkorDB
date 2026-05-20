"""Relevancy agent for determining relevancy of queries to database schema."""

import json
import logging
from typing import List, Optional

from .utils import BaseAgent, parse_response, run_completion

logger = logging.getLogger(__name__)


def build_session_summary(
    queries_history: List[str],
    result_history: Optional[List[str]],
    *,
    max_user_chars: int = 320,
    max_assistant_chars: int = 480,
) -> str:
    """
    Short recap of completed turns for relevancy. Excludes the latest user message
    (passed separately as the current question). Helps vague follow-ups (e.g. "2025")
    stay on-topic when prior turns established intent.
    """
    if not queries_history or len(queries_history) < 2:
        return (
            "(No prior turns in this session; the latest user message is the only "
            "message so far.)"
        )

    prior_queries = queries_history[:-1]
    results = list(result_history) if result_history else []

    lines = [
        "Session recap (prior user/assistant turns only; the **current** user "
        "message is stated separately in this prompt as the latest question):",
    ]
    for i, query in enumerate(prior_queries, start=1):
        u = (query or "").strip().replace("\n", " ")
        if len(u) > max_user_chars:
            u = u[: max_user_chars - 3] + "..."
        lines.append(f"{i}. User: {u}")
        if i - 1 < len(results):
            a = (results[i - 1] or "").strip().replace("\n", " ")
            if len(a) > max_assistant_chars:
                a = a[: max_assistant_chars - 3] + "..."
            lines.append(f"   Assistant: {a}")
        else:
            lines.append("   Assistant: (no reply recorded in history for this turn)")

    return "\n".join(lines)


RELEVANCY_PROMPT = """
You decide whether the user’s question fits this **text-to-SQL product**: could it reasonably become SQL
(or a brief clarification then SQL) against the **given** database description and conversation so far?

Inputs:
- Latest user question: {QUESTION_PLACEHOLDER}
- Database description (schema/context): {DB_PLACEHOLDER}
- **Session summary (prior turns only):**
{SESSION_SUMMARY_PLACEHOLDER}
- Older turns also appear as structured user/assistant messages in this chat.

**Status meanings**
- **On-topic**: The intent concerns this data domain and maps to SQL on this schema—including
  **SELECT/aggregates, INSERT, UPDATE, DELETE, MERGE/UPSERT, and DDL** (CREATE/ALTER/DROP/TRUNCATE,
  etc.) when clearly about this database. Short follow-ups (e.g. a year, “same for 2025”, “tiếp tục”)
  stay **On-topic** if prior turns already fixed the subject.
- **Off-topic**: Unrelated small talk, questions about the AI/model itself, clearly outside this
  business/schema, **or** (only if a separate **“viewer (read-only)”** block appears **later in this same
  message**) write/modify/schema-change requests that that block tells you to reject.
- **Inappropriate**: abusive, illegal, or clearly policy-violating content.

**Critical:** Do **not** set **Off-topic** *only* because the user wants to **insert, update, delete, or
change schema**—unless this **same** user message contains that later **viewer (read-only)** block.
Do **not** justify **Off-topic** by calling yourself a “read-only assistant” or “only retrieving data”
when no such viewer block is present.

Guidelines:

1. **Use the full conversation**, not just the last sentence. If the assistant asked for missing info
   and the user answered, the next message is on-topic.

2. **Actionable database intent** — pronouns and casual wording are fine when scope maps to the schema.

3. **Off-topic (general)** — unrelated topics, meta questions about the system, private data about
   people clearly outside this database, or inappropriate content (use **Inappropriate** for the last).

Output exactly **one** JSON object (no extra prose outside it):

On-topic:
{{
"status": "On-topic",
"reason": "Brief why this maps to SQL on this schema.",
"suggestions": []
}}

Off-topic:
{{
"status": "Off-topic",
"reason": "Brief why it is outside the data domain, or cite viewer-only rule if that block applies.",
"suggestions": ["One concrete alternative question about this schema."]
}}

Inappropriate:
{{
"status": "Inappropriate",
"reason": "Brief why it is inappropriate.",
"suggestions": ["Safer topics aligned with this schema."]
}}

Remember: prioritize **data intent over phrasing**; **writes/DDL are on-topic** when they target this
database **unless** a later **viewer (read-only)** section in this same message overrides that.
"""

# When demo role is "viewer", destructive / write intents must be Off-topic (read-only demo).
VIEWER_RELEVANCY_SUFFIX = """

**Demo session role: viewer (read-only).** Apply this **in addition** to the rules above:
- If the user’s **primary intent** is to **change data or database objects**—including natural-language
  equivalents of INSERT, UPDATE, DELETE, MERGE, UPSERT, TRUNCATE, DROP, CREATE (tables/indexes/views/etc.),
  ALTER, RENAME, GRANT/REVOKE, or bulk “remove / wipe / clear / xóa hết / cập nhật / thêm dòng” when it
  means modifying stored data or schema—respond with **status "Off-topic"** and a short reason (do **not**
  use "On-topic" for those requests).
- **Stay On-topic** for read-only asks: SELECT-style questions, counts, filters, reports, metrics,
  browsing schema **without** changing it, and follow-ups that only refine a prior read-only request.
- Questions that are abusive/illegal still use **"Inappropriate"** as before.
"""


class RelevancyAgent(BaseAgent):
    # pylint: disable=too-few-public-methods
    """Agent for determining relevancy of queries to database schema."""


    def _is_viewer_demo_role(self, demo_role: Optional[str]) -> bool:
        """True when client sent demo role viewer (read-only); unknown/omit treated as not viewer."""
        if demo_role is None:
            return False
        return str(demo_role).strip().lower() == "viewer"

    async def get_answer(
        self,
        user_question: str,
        database_desc: dict,
        demo_role: Optional[str] = None,
    ) -> dict:
        """Get relevancy assessment for user question against database description."""
        logger.debug("Relevancy agent question=%r database_desc=%s", user_question, database_desc)
        session_summary = build_session_summary(
            self.queries_history, self.result_history
        )
        base_prompt = RELEVANCY_PROMPT.format(
            QUESTION_PLACEHOLDER=user_question,
            DB_PLACEHOLDER=json.dumps(database_desc),
            SESSION_SUMMARY_PLACEHOLDER=session_summary,
        )
        if self._is_viewer_demo_role(demo_role):
            base_prompt = base_prompt + VIEWER_RELEVANCY_SUFFIX

        self.messages.append(
            {
                "role": "user",
                "content": base_prompt,
            }
        )

        answer = run_completion(
            self.messages, self.custom_model, self.custom_api_key, temperature=0
        )
        self.messages.append({"role": "assistant", "content": answer})
        logger.debug("Relevancy agent answer: %s", answer)
        return parse_response(answer)
        # answer = {
        #     "status": "On-topic",
        #     "reason": "Temporarily bypassed relevancy LLM check.",
        #     "suggestions": [],
        # }
        # self.messages.append({"role": "assistant", "content": json.dumps(answer)})
        # logger.debug("Relevancy agent bypass answer: %s", answer)
        # print("Relevancy agent bypass answer: %s", answer)
        # return answer
