"""FastAPI application entry point.

Right now this only exposes a health check. That lets us prove the backend boots
and responds before we add any real features on top of it.
"""

from fastapi import FastAPI

from app.config import get_settings

# The single FastAPI application instance that the server runs.
app = FastAPI(title="Glyph API")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return a simple ok status so callers can confirm the server is alive."""
    settings = get_settings()
    return {"status": "ok", "app": settings.app_name}
