"""Analysis agent for analyzing user queries and generating database analysis."""

import re
from typing import List
from .utils import BaseAgent, parse_response, run_completion


class AnalysisAgent(BaseAgent):
    # pylint: disable=too-few-public-methods
    """Agent for analyzing user queries and generating database analysis."""


    @staticmethod
    def _strip_lookup_tables_section(db_description: str) -> str:
        """
        Remove optional lookup-table appendix from db_description before prompting.
        """
        if not db_description:
            return db_description
        return re.sub(
            r"\n\nLookup/list tables \(row_count <= 20\) with sample values:\n[\s\S]*$",
            "",
            db_description,
            flags=re.MULTILINE,
        ).strip()

    def get_analysis(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        user_query: str,
        combined_tables: list,
        db_description: str,
        instructions: str | None = None,
        memory_context: str | None = None,
        database_type: str | None = None,
        user_rules_spec: str | None = None,
    ) -> dict:
        """Get analysis of user query against database schema."""
        formatted_schema = self._format_schema(combined_tables)
        # Add system message with database type if not already present
        if not self.messages or self.messages[0].get("role") != "system":
            self.messages.insert(0, {
                "role": "system",
                "content": (
                    f"You are a SQL expert. TARGET DATABASE: "
                    f"{database_type.upper() if database_type else 'UNKNOWN'}"
                )
            })

        clean_db_description = self._strip_lookup_tables_section(db_description)
        prompt = self._build_prompt(
            user_query, formatted_schema, clean_db_description,
            instructions, memory_context, database_type, user_rules_spec
        )
        self.messages.append({"role": "user", "content": prompt})
        print("***************** Analysis Agent: prompt", prompt)
        response = run_completion(
            self.messages, self.custom_model, self.custom_api_key, temperature=0
        )
        analysis = parse_response(response)
        if isinstance(analysis["ambiguities"], list):
            analysis["ambiguities"] = [
                item.replace("-", " ") for item in analysis["ambiguities"]
            ]
            analysis["ambiguities"] = "- " + "- ".join(analysis["ambiguities"])
        if isinstance(analysis["missing_information"], list):
            analysis["missing_information"] = [
                item.replace("-", " ") for item in analysis["missing_information"]
            ]
            analysis["missing_information"] = "- " + "- ".join(
                analysis["missing_information"]
            )
        self.messages.append({"role": "assistant", "content": analysis["sql_query"]})
        # print("***************** Analysis Agent: analysis", analysis)
        return analysis

    def _format_schema(self, schema_data: List) -> str:
        """
        Format the schema data into a readable format for the prompt.

        Args:
            schema_data: Schema in the structure [...]

        Returns:
            Formatted schema as a string
        """
        formatted_schema = []

        for table_info in schema_data:
            table_str = self._format_single_table(table_info)
            formatted_schema.append(table_str)

        return "\n".join(formatted_schema)

    def _format_single_table(self, table_info: List) -> str:
        """
        Format a single table's information.

        Args:
            table_info: Table information in the structure 
                       [name, description, foreign_keys, columns]

        Returns:
            Formatted table string
        """
        table_name = table_info[0]
        table_description = table_info[1]
        foreign_keys = table_info[2]
        columns = table_info[3]

        # Format table header
        table_str = f"Table: {table_name} - {table_description}\n"

        # Format columns
        table_str += self._format_table_columns(columns)

        # Format foreign keys
        table_str += self._format_foreign_keys(foreign_keys)

        return table_str

    def _format_table_columns(self, columns: List) -> str:
        """
        Format table columns information.

        Args:
            columns: List of column dictionaries

        Returns:
            Formatted columns string
        """
        columns_str = ""
        for column in columns:
            column_str = self._format_single_column(column)
            columns_str += column_str + "\n"
        return columns_str

    def _format_single_column(self, column: dict) -> str:
        """
        Format a single column's information.

        Args:
            column: Column dictionary with metadata

        Returns:
            Formatted column string
        """
        col_name = column.get("columnName", "")
        col_type = column.get("dataType", None)
        col_description = column.get("description", "")
        col_key = column.get("keyType", None)
        nullable = column.get("nullable", False)

        key_info = (
            ", PRIMARY KEY"
            if col_key == "PRI"
            else ", FOREIGN KEY" if col_key == "FK" else ""
        )
        return (f"  - {col_name} ({col_type},{key_info},{col_key},"
               f"{nullable}): {col_description}")

    def _format_foreign_keys(self, foreign_keys: dict) -> str:
        """
        Format foreign keys information.

        Args:
            foreign_keys: Dictionary of foreign key information

        Returns:
            Formatted foreign keys string
        """
        if not isinstance(foreign_keys, dict) or not foreign_keys:
            return ""

        fk_str = "  Foreign Keys:\n"
        for fk_name, fk_info in foreign_keys.items():
            column = fk_info.get("column", "")
            ref_table = fk_info.get("referenced_table", "")
            ref_column = fk_info.get("referenced_column", "")
            fk_str += f"  - {fk_name}: {column} references {ref_table}.{ref_column}\n"

        return fk_str

    def _build_prompt(   # pylint: disable=too-many-arguments, too-many-positional-arguments, disable=line-too-long, too-many-locals
        self, user_input: str, formatted_schema: str,
        db_description: str, instructions, memory_context: str | None = None,
        database_type: str | None = None,
        user_rules_spec: str | None = None,
    ) -> str:
        """
        Build the prompt for Claude to analyze the query.

        Args:
            user_input: The natural language query from the user
            formatted_schema: Formatted database schema
            db_description: Description of the database
            instructions: Custom instructions for the query
            memory_context: User and database memory context from previous interactions
            database_type: Target database type (sqlite, postgresql, mysql, etc.)
            user_rules_spec: Optional user-defined rules or specifications for SQL generation

        Returns:
            The formatted prompt for Claude
        """

        # Normalize optional inputs
        instructions = (instructions or "").strip()
        user_rules_spec = (user_rules_spec or "").strip()
        memory_context = (memory_context or "").strip()

        has_instructions = bool(instructions)
        has_user_rules = bool(user_rules_spec)
        has_memory = bool(memory_context)

        instructions_section = ""
        user_rules_section = ""
        memory_section = ""

        memory_instructions = ""
        memory_evaluation_guidelines = ""

#         if has_instructions:
#             instructions_section = f"""
#             <instructions>
#             {instructions}
#             </instructions>
# """

#         if has_user_rules:
#             user_rules_section = f"""
#             <user_rules_spec>
#             {user_rules_spec}
#             </user_rules_spec>
# # """
#         print("***************** Analysis Agent: has_memory", has_memory)
#         print("***************** Analysis Agent: memory_context", memory_context)
        if has_memory:
            memory_section = f"""
            <memory_context>
            The following information contains relevant context from previous interactions:

            {memory_context}

            Use this context to:
            1. Better understand the user's preferences and working style.
            2. Leverage previous learnings about this database.
            3. Learn from SUCCESSFUL QUERIES patterns and apply similar approaches.
            4. Avoid FAILED QUERIES patterns and the errors they caused.
            5. Resolve follow-up references (e.g., "ở trên", "those shops", "the above") using previously established entities/filters.
            6. Preserve the full previously established scope unless the user explicitly narrows or changes it.
            7. Never drop carried-over filter values from prior context (e.g., if prior scope is US + UK, keep both US and UK).
            8. For multi-value carried scope, use IN (...) or equivalent OR conditions so all values are included.
            9. If prior context implies multiple values but current SQL includes only a subset without explicit narrowing, treat it as incomplete.
            </memory_context>
        """
            memory_instructions = """
            - Use <memory_context> only to resolve follow-ups and previously established conventions.
            - Do not let memory override the schema, <user_rules_spec>, or <instructions>.
"""
            memory_evaluation_guidelines = """
            13. If <memory_context> exists, use it only for resolving follow-ups or established conventions; do not let memory override schema, <user_rules_spec>, or <instructions>.
"""

        # pylint: disable=line-too-long
        prompt = f"""
            You are a production Text-to-SQL system.

    TARGET DATABASE: {database_type}

    You are given:
    1) <database_description>
    {db_description}
    </database_description>

    2) <database_schema>
    {formatted_schema}
    </database_schema>

    3) <user_query>
    {user_input}
    </user_query>

    4) <memory_context>
    {memory_section}
    </memory_context>

    Rules:
    - Use ONLY tables/columns present in <database_schema>.
    - Return exactly ONE valid SQL statement.
    - Prefer minimal necessary joins/tables.
    - Do not invent formulas unless explicitly requested by the question.
    - If information is missing from schema/question, set is_sql_translatable=false and explain.
    - Use target SQL dialect quoting/syntax.
    - No markdown fences, no extra text outside JSON.

    Output JSON only:
    {{
    "is_sql_translatable": true/false,
    "query_analysis": "Brief intent + chosen tables/joins/filters",
    "explanation": "Why translatable or not",
    "sql_query": "Single SQL statement or empty string",
    "tables_used": ["..."],
    "missing_information": ["..."],
    "ambiguities": ["..."],
    "confidence": 0-100
    }}

            Again: OUTPUT ONLY ONE VALID JSON OBJECT AND NOTHING ELSE (no markdown fences, no SQL outside JSON, no query results, no debug text).
"""  # pylint: disable=line-too-long
        return prompt
