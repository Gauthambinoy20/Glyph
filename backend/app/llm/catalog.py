"""The curated list of chat models the user can pick from.

Free models always work on a free OpenRouter key. The paid ones are shown with a note
and marked available only when a paid key is configured, so the UI can grey them out.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelInfo:
    """One selectable model."""

    id: str
    label: str
    tier: str  # "free" or "paid"
    note: str


# Order matters: this is the order shown in the dropdown. Only models that currently have a
# live free endpoint on OpenRouter are listed — stale ids (qwen3-coder, llama-3.3, deepseek-r1)
# now 404 with "No endpoints found", which would surface as a failed answer, so they are out.
_CATALOG: list[ModelInfo] = [
    ModelInfo("openai/gpt-oss-120b:free", "GPT-OSS 120B", "free", "Large open model (default)"),
    ModelInfo("openai/gpt-oss-20b:free", "GPT-OSS 20B", "free", "Smaller and fast"),
    ModelInfo("openai/gpt-4o-mini", "GPT-4o mini", "paid", "~a fraction of a cent per question"),
    ModelInfo("anthropic/claude-3.5-haiku", "Claude Haiku", "paid", "Fast and cheap, needs credit"),
]


def list_models(has_paid_key: bool) -> list[dict]:
    """Return the catalog as plain dicts, flagging which are available right now."""
    return [
        {
            "id": model.id,
            "label": model.label,
            "tier": model.tier,
            "note": model.note,
            "available": model.tier == "free" or has_paid_key,
        }
        for model in _CATALOG
    ]


def is_known_model(model_id: str) -> bool:
    """Return True if the id is one of our catalog models."""
    return any(model.id == model_id for model in _CATALOG)
