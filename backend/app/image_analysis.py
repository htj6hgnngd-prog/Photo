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
