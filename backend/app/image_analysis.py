"""Fast, deterministic image diagnostics used as a baseline before AI correction.

These measurements describe decoded pixels; they do not infer the intended
white balance or prescribe edits. Downsampling bounds work for batch uploads.
"""
from __future__ import annotations

from io import BytesIO
from PIL import Image, ImageStat, UnidentifiedImageError

MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_IMAGE_PIXELS = 80_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
ANALYSIS_EDGE = 256


class ImageAnalysisError(ValueError):
    """Raised when an uploaded image is invalid or outside supported limits."""


def analyze_image_bytes(data: bytes) -> dict[str, object]:
    if not data:
        raise ImageAnalysisError("Image is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ImageAnalysisError("Image exceeds the 25 MB limit.")

    try:
        with Image.open(BytesIO(data)) as source:
            image_format = source.format
            if image_format not in ALLOWED_FORMATS:
                raise ImageAnalysisError("Only JPEG, PNG, and WEBP are supported.")
            width, height = source.size
            if width < 1 or height < 1 or width * height > MAX_IMAGE_PIXELS:
                raise ImageAnalysisError("Image dimensions are invalid or exceed 80 megapixels.")
            source.seek(0)
            image = source.convert("RGB")
    except ImageAnalysisError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageAnalysisError("File is not a valid supported image.") from exc

    image.thumbnail((ANALYSIS_EDGE, ANALYSIS_EDGE), Image.Resampling.LANCZOS)
    pixels = list(image.getdata())
    count = len(pixels)
    luminance = sorted(
        (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
        for r, g, b in pixels
    )

    def percentile(fraction: float) -> float:
        return round(luminance[min(count - 1, int((count - 1) * fraction))], 4)

    channel_means = ImageStat.Stat(image).mean
    dark = sum(value <= 0.02 for value in luminance)
    bright = sum(value >= 0.98 for value in luminance)
    return {
        "format": image_format.lower(),
        "width": width,
        "height": height,
        "analysis_width": image.width,
        "analysis_height": image.height,
        "sampled_pixels": count,
        "luminance": {
            "mean": round(sum(luminance) / count, 4),
            "p10": percentile(0.10),
            "p50": percentile(0.50),
            "p90": percentile(0.90),
            "near_black_fraction": round(dark / count, 4),
            "near_white_fraction": round(bright / count, 4),
        },
        "rgb_mean": {
            "red": round(channel_means[0] / 255.0, 4),
            "green": round(channel_means[1] / 255.0, 4),
            "blue": round(channel_means[2] / 255.0, 4),
        },
        "interpretation": "diagnostics_only",
        "warnings": [
            "Pixel statistics do not determine intended white balance or lighting.",
            "JPEG analysis cannot recover clipped highlights or RAW sensor data.",
        ],
    }



def estimate_technical_adjustments(diagnostics: dict[str, object]) -> dict[str, object]:
    """Create conservative, editable starting values from global pixel statistics.

    This is a heuristic baseline, not semantic AI: scene content and lighting
    can make a globally dark or color-biased image intentional.
    """
    luminance = diagnostics["luminance"]
    median = float(luminance["p50"])
    p10 = float(luminance["p10"])
    p90 = float(luminance["p90"])
    near_black = float(luminance["near_black_fraction"])
    near_white = float(luminance["near_white_fraction"])

    # Avoid unstable estimates for nearly black/white frames.
    if median <= 0.03 or median >= 0.97:
        exposure_ev = 0.0
        confidence = 0.2
        warnings = ["Exposure estimate skipped: median brightness is near an extreme."]
    else:
        import math
        exposure_ev = round(max(-0.7, min(0.7, math.log2(0.42 / median))), 2)
        confidence = 0.35
        warnings = ["Global histogram cannot distinguish intentional low/high-key lighting from exposure error."]

    highlights = -20.0 if p90 > 0.92 and near_white > 0.01 else 0.0
    shadows = 20.0 if p10 < 0.08 and near_black > 0.01 else 0.0
    if highlights or shadows:
        confidence = min(confidence, 0.3)
    warnings.append("White balance is left unchanged because scene lighting and neutral references are unknown.")

    return {
        "adjustments": {
            "exposure_ev": exposure_ev,
            "temperature": None,
            "tint": None,
            "highlights": highlights,
            "shadows": shadows,
            "black_point": 0.0,
            "white_point": 0.0,
        },
        "confidence": confidence,
        "editable": True,
        "applied": False,
        "method": "conservative_histogram_heuristic",
        "warnings": warnings,
    }
