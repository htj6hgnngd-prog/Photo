"""Unit tests for deterministic image diagnostics."""
import unittest
from io import BytesIO

from PIL import Image

from app.image_analysis import (\n    ImageAnalysisError, analyze_image_bytes, estimate_technical_adjustments,\n)


def encoded_image(color, image_format="JPEG", size=(32, 24)):
    stream = BytesIO()
    Image.new("RGB", size, color).save(stream, format=image_format)
    return stream.getvalue()


class ImageAnalysisTests(unittest.TestCase):
    def test_reports_dimensions_and_diagnostics_without_editing(self):
        result = analyze_image_bytes(encoded_image((128, 128, 128)))
        self.assertEqual(result["format"], "jpeg")
        self.assertEqual((result["width"], result["height"]), (32, 24))
        self.assertEqual(result["interpretation"], "diagnostics_only")
        self.assertAlmostEqual(result["luminance"]["mean"], 0.502, delta=0.02)
        self.assertIn("warnings", result)

    def test_reports_near_black_and_white_samples(self):
        black = analyze_image_bytes(encoded_image((0, 0, 0), "PNG"))
        white = analyze_image_bytes(encoded_image((255, 255, 255), "PNG"))
        self.assertEqual(black["luminance"]["near_black_fraction"], 1.0)
        self.assertEqual(white["luminance"]["near_white_fraction"], 1.0)

    def test_estimates_are_editable_and_not_applied(self):
        dark = analyze_image_bytes(encoded_image((45, 45, 45), "PNG"))
        estimate = estimate_technical_adjustments(dark)
        self.assertTrue(estimate["editable"])
        self.assertFalse(estimate["applied"])
        self.assertGreater(estimate["adjustments"]["exposure_ev"], 0)
        self.assertIsNone(estimate["adjustments"]["temperature"])

    def test_extreme_median_skips_exposure_guess(self):
        black = analyze_image_bytes(encoded_image((0, 0, 0), "PNG"))
        estimate = estimate_technical_adjustments(black)
        self.assertEqual(estimate["adjustments"]["exposure_ev"], 0.0)
        self.assertLessEqual(estimate["confidence"], 0.2)
        self.assertTrue(estimate["warnings"])

    def test_rejects_empty_and_invalid_files(self):
        for payload in (b"", b"not an image"):
            with self.subTest(payload=payload):
                with self.assertRaises(ImageAnalysisError):
                    analyze_image_bytes(payload)

    def test_rejects_unsupported_format(self):
        with self.assertRaises(ImageAnalysisError):
            analyze_image_bytes(encoded_image((10, 20, 30), "GIF"))


if __name__ == "__main__":
    unittest.main()
