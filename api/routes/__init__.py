"""Routes module for text2sql API."""

from .graphs import graphs_router
from .database import database_router
from .history import history_router

__all__ = ["graphs_router", "database_router", "history_router"]
