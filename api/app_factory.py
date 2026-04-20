"""Application factory for the text2sql FastAPI app."""

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from fastmcp import FastMCP
from fastmcp.server.openapi import MCPType, RouteMap

from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from api.routes.graphs import graphs_router
from api.routes.database import database_router
from api.routes.settings import settings_router

load_dotenv()
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


class SecurityMiddleware(BaseHTTPMiddleware):  # pylint: disable=too-few-public-methods
    """Middleware for security checks including static file access"""

    STATIC_PREFIX = "/static/"

    async def dispatch(self, request: Request, call_next):
        # Block directory access in static files
        if request.url.path.startswith(self.STATIC_PREFIX):
            filename = request.url.path[len(self.STATIC_PREFIX) :]
            if not filename or "../" in filename or filename.endswith("/"):
                return JSONResponse(status_code=403, content={"detail": "Forbidden"})

        response = await call_next(request)

        # Add HSTS header to prevent man-in-the-middle attacks
        hsts_value = "max-age=31536000; includeSubDomains; preload"
        response.headers["Strict-Transport-Security"] = hsts_value

        return response


def create_app():  # pylint: disable=too-many-statements
    """Create and configure the FastAPI application."""

    app = FastAPI(
        title="QueryWeaver"
    )

    # Include routers
    app.include_router(graphs_router, prefix="/graphs")
    app.include_router(database_router)
    app.include_router(settings_router, prefix="/api")

    # Control MCP endpoints via environment variable DISABLE_MCP
    # Default: MCP is enabled unless DISABLE_MCP is set to true
    disable_mcp = os.getenv("DISABLE_MCP", "false").lower() in ("1", "true", "yes")
    mcp_app = None
    if disable_mcp:
        logging.info("MCP endpoints disabled via DISABLE_MCP environment variable")
        routes=[
            *app.routes,  # Original API routes only
        ]
    else:
        mcp = FastMCP.from_fastapi(
            app=app,
            name="queryweaver",
            route_maps=[
                RouteMap(tags={"mcp_resource"}, mcp_type=MCPType.RESOURCE),
                RouteMap(
                    tags={"mcp_resource_template"},
                    mcp_type=MCPType.RESOURCE_TEMPLATE,
                ),
                RouteMap(tags={"mcp_tool"}, mcp_type=MCPType.TOOL),
                RouteMap(mcp_type=MCPType.EXCLUDE),
            ],
        )
        mcp_app = mcp.http_app(path="/mcp")

        routes = [
            *mcp_app.routes,  # MCP routes
            *app.routes,  # Original API routes
        ]

    # Combine the MCP app and original app
    app = FastAPI(
        title="QueryWeaver",
        description="Text2SQL with Graph-Powered Schema Understanding",
        openapi_tags=[
            {
                "name": "Graphs & Databases",
                "description": "Database schema management and querying",
            },
            {
                "name": "Database Connection",
                "description": "Connect to external databases",
            },
        ],
        routes=routes,
        lifespan=mcp_app.lifespan if mcp_app else None,
    )

    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

    # Add security middleware
    app.add_middleware(SecurityMiddleware)

    # Mount static files from the React build (app/dist)
    dist_path = os.path.join(os.path.dirname(__file__), "../app/dist")
    if os.path.exists(dist_path):
        app.mount(
            "/assets",
            StaticFiles(directory=os.path.join(dist_path, "assets")),
            name="assets"
        )

        if os.path.exists(os.path.join(dist_path, "icons")):
            app.mount(
                "/icons",
                StaticFiles(directory=os.path.join(dist_path, "icons")),
                name="icons"
            )
        if os.path.exists(os.path.join(dist_path, "img")):
            app.mount(
                "/img",
                StaticFiles(directory=os.path.join(dist_path, "img")),
                name="img"
            )

        app.mount("/static", StaticFiles(directory=dist_path), name="static")
    else:
        logging.warning(
            "React build directory not found at %s. "
            "Run 'cd app && npm run build' to build the frontend.",
            dist_path
        )

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        """Serve the favicon from the React build directory."""
        favicon_path = os.path.join(dist_path, "favicon.ico")
        if os.path.exists(favicon_path):
            return FileResponse(favicon_path, media_type="image/x-icon")
        return JSONResponse({"error": "Favicon not found"}, status_code=404)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        request: Request, exc: Exception
    ):  # pylint: disable=unused-argument
        """Re-raise HTTPExceptions and propagate other errors."""
        if isinstance(exc, HTTPException):
            raise exc
        raise exc

    # Serve React app for all non-API routes (SPA catch-all)
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_react_app(full_path: str):  # pylint: disable=unused-argument
        """Serve the React app for all routes not handled by API endpoints."""
        index_path = os.path.join(dist_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return JSONResponse({"error": "React app not found"}, status_code=404)

    return app
