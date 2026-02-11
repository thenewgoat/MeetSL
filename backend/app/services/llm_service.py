"""LLM integration service for sign token gap-filling."""

import json
import logging
import os

from openai import AsyncOpenAI
from schemas.llm_suggest import LLMSuggestResponse

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None

SYSTEM_PROMPT = """\
You are a sign language interpreter assistant for real-time meetings.

You receive a list of recognized sign language tokens with confidence scores. \
Your job is to suggest a fluent English phrase that preserves the meaning \
of ALL recognized tokens.

RULES:
1. NEVER add information, facts, or words not directly implied by the tokens.
2. NEVER drop or contradict any recognized token.
3. You may add small grammatical connectors (articles, prepositions) \
to make the phrase natural.
4. Keep the output short and conversational.
5. If the tokens are ambiguous, provide 1-2 brief alternatives.
6. Respond with ONLY a JSON object — no markdown, no explanation.

Required JSON format:
{
  "suggested_text": "the fluent phrase",
  "alternatives": ["alternative phrasing 1"]
}
"""


def _get_client() -> AsyncOpenAI:
    """Return the OpenAI async client, initializing on first call."""
    global _client
    if _client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY environment variable is not set")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


def _compute_uncertainty(
    tokens: list[dict],
) -> tuple[str, bool]:
    """Determine uncertainty level from token confidences (pre-LLM heuristic)."""
    if len(tokens) < 2:
        return "high", True

    confidences = [t.get("confidence", 0) for t in tokens]
    min_conf = min(confidences)

    if min_conf >= 0.6:
        return "low", False
    elif min_conf >= 0.5:
        return "medium", True
    else:
        return "high", True


def _fallback_response(tokens: list[dict]) -> LLMSuggestResponse:
    """Fallback when LLM call fails — just join tokens."""
    text = " ".join(t.get("token", "") for t in tokens)
    uncertainty, needs_conf = _compute_uncertainty(tokens)
    return LLMSuggestResponse(
        suggested_text=text,
        uncertainty_level=uncertainty,
        alternatives=[],
        needs_confirmation=needs_conf,
    )


async def suggest(
    tokens: list[dict],
    domain: str = "meeting",
    recent_speech_context: str | None = None,
) -> LLMSuggestResponse:
    """Call ChatGPT to suggest a fluent phrase from recognized sign tokens."""
    uncertainty, needs_conf = _compute_uncertainty(tokens)

    # Build user message
    token_list = ", ".join(
        f'"{t["token"]}" (conf={t.get("confidence", 0):.2f})'
        for t in tokens
    )
    user_msg = f"Domain: {domain}\nRecognized tokens: [{token_list}]"
    if recent_speech_context:
        user_msg += f"\nRecent speech context: {recent_speech_context}"

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=200,
            temperature=0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        )

        raw_text = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        parsed = json.loads(raw_text)

        suggested_text = parsed.get("suggested_text", "")
        alternatives = parsed.get("alternatives", [])

        if not suggested_text:
            return _fallback_response(tokens)

        return LLMSuggestResponse(
            suggested_text=suggested_text,
            uncertainty_level=uncertainty,
            alternatives=alternatives[:3],
            needs_confirmation=needs_conf,
        )

    except Exception:
        logger.exception("LLM suggest call failed, using fallback")
        return _fallback_response(tokens)
