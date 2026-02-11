"""Health check endpoint."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Return service health status."""
    return {"status": "ok"}
