"""Stable internal contract for image-analysis and neutralization providers.

No vendor is configured by default. Implementations must be added only after
API access, JPEG behavior, costs, and data handling have been verified.
"""
from dataclasses import dataclass, field
from typing import Literal, Protocol


@dataclass(frozen=True)
class CorrectionEstimate:
    """Editable technical corrections; values are suggestions, not pixel data."""

    exposure_ev: float = 0.0
    temperature: float | None = None
    tint: float | None = None
    highlights: float = 0.0
    shadows: float = 0.0
    black_point: float = 0.0
    white_point: float = 0.0
    confidence: float | None = None
    warnings: tuple[str, ...] = field(default_factory=tuple)
    provider: str = "local"
    model_version: str | None = None


@dataclass(frozen=True)
class ImageContext:
    asset_id: str
    filename: str
    media_type: Literal["image/jpeg", "image/png", "image/webp"]


@dataclass(frozen=True)
class ProviderResult:
    asset_id: str
    status: Literal["succeeded", "failed"]
    estimate: CorrectionEstimate | None = None
    output_bytes: bytes | None = None
    error_code: str | None = None
    error_message: str | None = None


class NeutralizationProvider(Protocol):
    """Adapter contract. Vendor-specific schemas stay behind this boundary."""

    name: str

    async def analyze(self, image: bytes, context: ImageContext) -> CorrectionEstimate:
        """Return per-image technical estimates without applying a creative look."""
        ...

    async def process(
        self, image: bytes, estimate: CorrectionEstimate, context: ImageContext
    ) -> ProviderResult:
        """Optionally render corrections; preserve asset_id in every result."""
        ...


def provider_status() -> dict[str, object]:
    """Report integration readiness honestly until a concrete adapter exists."""
    return {
        "configured": False,
        "provider": None,
        "capabilities": [],
        "message": "AI provider is not connected; local preview remains available.",
    }
