
"""
This module contains the configuration for the text2sql module.
"""

import os
import logging
import dataclasses

_config_log = logging.getLogger(__name__)
from typing import Union
from litellm import embedding

# Configure litellm logging to prevent sensitive data leakage
def configure_litellm_logging():
    """Configure litellm to suppress completion logs."""

    # Disable LiteLLM logger that outputs
    litellm_logger = logging.getLogger("LiteLLM")
    litellm_logger.setLevel(logging.ERROR)
    litellm_logger.disabled = True


# Initialize litellm configuration
configure_litellm_logging()


class EmbeddingsModel:
    """Embeddings model wrapper for text embedding operations."""

    def __init__(self, model_name: str, config: dict = None):
        self.model_name = model_name
        self.config = config

    def embed(self, text: Union[str, list]) -> list:
        """
        Get the embeddings of the text

        Args:
            text (str|list): The text(s) to embed

        Returns:
            list: The embeddings of the text

        """
        embeddings = embedding(model=self.model_name, input=text)
        embeddings = [embedding["embedding"] for embedding in embeddings.data]
        return embeddings

    def get_vector_size(self) -> int:
        """
        Get the size of the vector

        Returns:
            int: The size of the vector

        """
        response = embedding(input=["Hello World"], model=self.model_name)
        size = len(response.data[0]["embedding"])
        return size


def _with_prefix(model: str, provider: str) -> str:
    """Ensure a model string has exactly one provider prefix."""
    prefix = f"{provider}/"
    return prefix + model.removeprefix(prefix)


@dataclasses.dataclass
class Config:
    """
    Configuration class for the text2sql module.
    """

    # User-provided overrides via env vars
    _user_completion = os.getenv("COMPLETION_MODEL", "")
    _user_embedding = os.getenv("EMBEDDING_MODEL", "")

    # Determine the provider and models based on available API keys
    # Priority: Ollama > OpenAI > Gemini > Anthropic > Cohere > Azure (default)
    if os.getenv("OLLAMA_MODEL"):
        LLM_PROVIDER = "ollama"
        AZURE_FLAG = False
        COMPLETION_MODEL = _user_completion or _with_prefix(
            os.getenv("OLLAMA_MODEL"), "ollama")
        EMBEDDING_MODEL_NAME = _user_embedding or _with_prefix(
            os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text-v2-moe:latest"), "ollama")
    elif os.getenv("GROQ_API_KEY"):
        LLM_PROVIDER = "openai"
        AZURE_FLAG = False
        COMPLETION_MODEL = _user_completion or _with_prefix(
            os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"), "groq")
        EMBEDDING_MODEL_NAME = _user_embedding or _with_prefix(
            os.getenv("GROQ_EMBEDDING_MODEL", "nomic-embed-text-v2-moe:latest"), "ollama")
    elif os.getenv("OPENAI_API_KEY"):
        LLM_PROVIDER = "openai"
        AZURE_FLAG = False
        COMPLETION_MODEL = _user_completion or "openai/gpt-4.1-nano"
        EMBEDDING_MODEL_NAME = _user_embedding or _with_prefix(
            os.getenv("OLLAMA_EMBEDDING_MODEL", "jeffh/intfloat-e5-base-v2:f32 "), "ollama")
    elif os.getenv("GEMINI_API_KEY"):
        LLM_PROVIDER = "gemini"
        AZURE_FLAG = False
        COMPLETION_MODEL = _user_completion or "gemini/gemini-2.0-flash"
        EMBEDDING_MODEL_NAME = _user_embedding or "gemini/gemini-embedding-001"
    elif os.getenv("ANTHROPIC_API_KEY"):
        LLM_PROVIDER = "anthropic"
        AZURE_FLAG = False
        COMPLETION_MODEL = _user_completion or "anthropic/claude-sonnet-4-5-20250929"
        if _user_embedding:
            EMBEDDING_MODEL_NAME = _user_embedding
        elif os.getenv("VOYAGE_API_KEY"):
            EMBEDDING_MODEL_NAME = "voyage/voyage-3"
        else:
            raise ValueError(
                "Anthropic has no native embeddings. "
                "Set EMBEDDING_MODEL or VOYAGE_API_KEY for embeddings."
            )
    elif os.getenv("COHERE_API_KEY"):
        LLM_PROVIDER = "cohere"
        AZURE_FLAG = False
        COMPLETION_MODEL = _user_completion or _with_prefix(
            os.getenv("COHERE_MODEL", "command-a-03-2025"), "cohere")
        EMBEDDING_MODEL_NAME = _user_embedding or _with_prefix(
            os.getenv("COHERE_EMBEDDING_MODEL", "embed-v4.0"), "cohere")
    else:
        # Default to Azure
        LLM_PROVIDER = "azure"
        AZURE_FLAG = True
        COMPLETION_MODEL = _user_completion or "azure/gpt-4.1"
        EMBEDDING_MODEL_NAME = _user_embedding or "azure/text-embedding-ada-002"

    # Temporary debug (runs at import time). Avoid adding secrets here.
    _config_log.info(
        "[Config] COMPLETION_MODEL=%s EMBEDDING_MODEL_NAME=%s",
        COMPLETION_MODEL,
        EMBEDDING_MODEL_NAME,
    )
    print("**********COMPLETION_MODEL**********", COMPLETION_MODEL)
    print("**********EMBEDDING_MODEL_NAME**********", EMBEDDING_MODEL_NAME)

    DB_MAX_DISTINCT: int = 100  # pylint: disable=invalid-name
    DB_UNIQUENESS_THRESHOLD: float = 0.5  # pylint: disable=invalid-name
    SHORT_MEMORY_LENGTH = 5  # Maximum number of questions to keep in short-term memory
    MAX_TABLES_FOR_ANALYSIS: int = int(os.getenv("MAX_TABLES_FOR_ANALYSIS", "5"))
    # Top-K vector hits in graph find (FalkorDB queryNodes), separate for tables vs columns
    VECTOR_SEARCH_TOP_K_TABLES: int = max(
        1, int(os.getenv("VECTOR_SEARCH_TOP_K_TABLES", "3"))
    )
    VECTOR_SEARCH_TOP_K_COLUMNS: int = max(
        1, int(os.getenv("VECTOR_SEARCH_TOP_K_COLUMNS", "3"))
    )
    # How many table/column descriptions the find-step LLM must return (each → one embedding search)
    FIND_TABLE_DESCRIPTIONS_COUNT: int = max(
        1, int(os.getenv("FIND_TABLE_DESCRIPTIONS_COUNT", "1"))
    )
    FIND_COLUMN_DESCRIPTIONS_COUNT: int = max(
        1, int(os.getenv("FIND_COLUMN_DESCRIPTIONS_COUNT", "1"))
    )

    EMBEDDING_MODEL = EmbeddingsModel(model_name=EMBEDDING_MODEL_NAME)

    FIND_SYSTEM_PROMPT = """
    You are an expert in analyzing natural language queries into SQL table/column descriptions.
    Please analyze the user's query and generate descriptions that are most relevant to the query.
    Return at most {table_count} table description(s) and at most {column_count} column description(s).
    - tables_descriptions may contain from 0 up to {table_count} item(s).
    - columns_descriptions may contain from 0 up to {column_count} item(s).
    - Return fewer items when the query is narrow or only a few aspects are relevant; do not pad to reach the limit.
    - Do not generate duplicate or near-duplicate descriptions.
    - When returning more than one description per list, target different semantic aspects
      (e.g. revenue vs geography vs time) so vector search can reach different tables/columns.
    - Create generic descriptions; do not use specific codes, values, or conditions.
    - Keep descriptions accurate and concise.

    Keep in mind that the database that you work with has the following DB description: {db_description}.

    **Input:**
    * **Relational Database:**
    You will be provided with database name and the description of the database domain.

    * **Previous User Queries:**
    You will be provided with a list of previous queries the user has asked in this session. Each query will be prefixed with "Query N:" where N is the query number. Use this context to better understand the user's intent and provide more relevant table and column suggestions.

    * **User Query (Natural Language):**
    You will be given a user's current question or request in natural language.

    **Output:**
    * **Table Descriptions:**
    Provide up to {table_count} table description(s) that best match the combined context
    of previous user queries and the current user query.

    * **Column Descriptions:**
    Provide up to {column_count} column description(s) that best match the combined context
    of previous user queries and the current user query.
    """
