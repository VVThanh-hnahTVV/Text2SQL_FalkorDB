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
You are an expert assistant tasked with determining whether the user's question is relevant (translatable into a database query). 
You are given:
- The user's latest question: {QUESTION_PLACEHOLDER}
- The database description: {DB_PLACEHOLDER}
- **Session summary (prior turns):**
{SESSION_SUMMARY_PLACEHOLDER}

- The conversation history (previous questions and answers) is also provided in this chat as structured messages.

Guidelines:

1. **Always use the full conversation context** when deciding relevance, not just the latest question.
   - Use the **session summary** and the chat messages together: short follow-ups (e.g. a year, "same but for 2025", "tiếp tục") are **on-topic** if prior turns already established a database-related intent (metrics, uninstalls, date ranges, etc.).
   - If earlier in the chat the system asked for missing information (e.g., "What's your name or ID?") and the user provided it, then the current question should be treated as valid and on-topic.
   - Consider whether ambiguities have already been resolved in prior turns.

2. **Focus on actionable intent for database querying.**
   - Ask yourself: "Can this request, given the conversation so far, be answered by querying the database?"
   - Personal pronouns ("I", "my", "me") are on-topic if the user has identified themselves or if the intent clearly maps to database data.
   - Conversational or casual phrasing is fine as long as the underlying request is for data.

3. **On-topic cases include:**
   - Questions that can be translated into database queries (directly or with previously provided clarifications).
   - Personal queries where the user provided their identity after being asked.
   - Questions about data, database structure, reports, metrics, or insights.

4. **Off-topic cases include:**
   - Completely unrelated to data/business information,
   - Questions about the AI/system itself,
   - Requests for private information about people outside the database,
   - Offensive, illegal, or guideline-violating content.

Output format:

• On-topic and appropriate:
{{
"status": "On-topic",
"reason": "Brief explanation of why it can be translated to a database query.",
"suggestions": []
}}

• Off-topic:
{{
"status": "Off-topic",
"reason": "Short reason why it cannot be translated to a database query.",
"suggestions": [
"An alternative, high-level question about the schema..."
]
}}

• Inappropriate:
{{
"status": "Inappropriate",
"reason": "Short reason why it is inappropriate.",
"suggestions": [
"Suggested topics that would be more appropriate..."
]
}}

Remember: **Prioritize the conversation’s actionable data intent over phrasing style. If missing info (like identity) was provided earlier in the chat, treat the question as on-topic.**
"""


class RelevancyAgent(BaseAgent):
    # pylint: disable=too-few-public-methods
    """Agent for determining relevancy of queries to database schema."""


    async def get_answer(self, user_question: str, database_desc: dict) -> dict:
        """Get relevancy assessment for user question against database description."""
        logger.debug("Relevancy agent question=%r database_desc=%s", user_question, database_desc)
        session_summary = build_session_summary(
            self.queries_history, self.result_history
        )
        self.messages.append(
            {
                "role": "user",
                "content": RELEVANCY_PROMPT.format(
                    QUESTION_PLACEHOLDER=user_question,
                    DB_PLACEHOLDER=json.dumps(database_desc),
                    SESSION_SUMMARY_PLACEHOLDER=session_summary,
                ),
            }
        )

        # Temporary bypass: always treat as On-topic.
        # answer = run_completion(
        #     self.messages, self.custom_model, self.custom_api_key, temperature=0
        # )
        # self.messages.append({"role": "assistant", "content": answer})
        # logger.debug("Relevancy agent answer: %s", answer)
        # return parse_response(answer)
        answer = {
            "status": "On-topic",
            "reason": "Temporarily bypassed relevancy LLM check.",
            "suggestions": [],
        }
        self.messages.append({"role": "assistant", "content": json.dumps(answer)})
        logger.debug("Relevancy agent bypass answer: %s", answer)
        print("Relevancy agent bypass answer: %s", answer)
        return answer
