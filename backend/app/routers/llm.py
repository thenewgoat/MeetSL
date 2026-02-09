from fastapi import APIRouter

router = APIRouter()

# TODO (Phase 5): POST /llm/suggest
# - Accept recognized tokens + confidences + domain context
# - Return structured JSON: { suggested_text, uncertainty_level, alternatives[], needs_confirmation }
