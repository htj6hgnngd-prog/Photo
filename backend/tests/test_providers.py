"""Tests for the provider boundary and truthful readiness reporting."""
import unittest

from app.providers import CorrectionEstimate, ImageContext, ProviderResult, provider_status


class ProviderContractTests(unittest.TestCase):
    def test_provider_is_reported_unconfigured_by_default(self):
        status = provider_status()
        self.assertIs(status["configured"], False)
        self.assertIsNone(status["provider"])
        self.assertEqual(status["capabilities"], [])
        self.assertIn("not connected", status["message"])

    def test_correction_estimate_defaults_are_neutral(self):
        estimate = CorrectionEstimate()
        self.assertEqual(estimate.exposure_ev, 0.0)
        self.assertEqual(estimate.highlights, 0.0)
        self.assertEqual(estimate.shadows, 0.0)
        self.assertEqual(estimate.warnings, ())

    def test_context_and_result_preserve_asset_identity(self):
        context = ImageContext(
            asset_id="asset-1", filename="portrait.jpg", media_type="image/jpeg"
        )
        result = ProviderResult(asset_id=context.asset_id, status="succeeded")
        self.assertEqual(result.asset_id, context.asset_id)
        self.assertEqual(context.media_type, "image/jpeg")


if __name__ == "__main__":
    unittest.main()
