# AI Pipeline Architecture

## Product goal

Photo AI Editor is a browser-first, non-destructive batch editor. The target workflow is import → per-image analysis → technical neutralization → creative grade (XMP / Capture One styles) → optional portrait retouch → batch export. Technical neutralization is an estimate from JPEG pixels, not recovery of RAW sensor data or original white balance. Preserve intentional warm or colored lighting.

## Processing hierarchy

1. **Asset:** immutable original, stable ID, filename, dimensions, metadata, color profile, thumbnail.
2. **Analysis:** image statistics and model estimates; suggestions, confidence and warnings only. Never mutate pixels.
3. **Technical correction:** exposure EV, white balance/tint or channel gains, highlights, shadows, black/white points. Store parameters separately.
4. **Creative grade:** imported style, curves, HSL, color balance and supported controls. Preserve unsupported source parameters and disclose them.
5. **Retouch:** optional portrait-specific stage, isolated from global color.
6. **Render/export:** deterministic stage composition, format/quality, batch progress, retries and manifest.
7. **Project:** assets, per-image parameters, stage enablement/order, preset library, provider jobs and edit history.

Recommended render order: decode original → technical correction → creative grade → optional retouch → encode output. A vendor that returns a baked creative look must not be treated as a neutralization provider.

## Local image diagnostics

The backend exposes `POST /api/images/analyze` for JPEG, PNG and WEBP uploads. It validates format, byte size (25 MB) and pixel dimensions (80 MP), downsamples to a bounded analysis image, and reports luminance percentiles, near-black/near-white fractions and RGB channel means. These are diagnostic measurements only: they do not prescribe white balance, claim AI inference, alter pixels, or recover clipped JPEG data.

The companion `POST /api/images/estimate` endpoint converts those measurements into conservative, editable starting values for exposure, highlights and shadows. It deliberately leaves temperature/tint unchanged, marks estimates as unapplied, and returns low confidence plus warnings because global statistics cannot distinguish intentional lighting or scene composition. These heuristics are a baseline for review, not an AI model or final correction. The browser editor can request this estimate for the selected original, apply the suggested exposure to its editable controls, and render suggested highlights/shadows as separate tonal adjustments. The frontend accepts `VITE_API_BASE` for the backend origin (default `http://localhost:8000`).

## Provider architecture

React should call Photo's own FastAPI endpoints, never a vendor directly. Backend provider adapters translate Photo's stable internal contract into vendor-specific calls. Keep credentials server-side. A conceptual interface:

```python
class NeutralizationProvider:
    async def analyze(self, image, context) -> NeutralizationEstimate: ...
    async def process(self, image, estimate, options) -> ProcessedImage: ...
```

An estimate should carry editable correction parameters where available, confidence, warnings, provider/model version and asset ID. A provider returning only a flattened image is a raster stage with limited editability, not a parameter estimate.

Adapters must validate type/size/count/profile; submit asynchronous jobs; track status per image; normalize errors; support timeout, retry and cancellation; report estimated cost before submission; retain/delete temporary files under a defined policy.

## Candidate services and integration fit

| Product | Relevant capability | Integration assessment |
|---|---|---|
| Evoto | Auto Color Corrections estimates white balance and exposure; Multi-Image Color Consistency matches a selected reference. JPEG import/export and batch sync are documented. | Good functional benchmark. Some basic color tools export without credits only on an active paid plan; AI Color Match/Looks and retouch consume credits. Desktop feature does not imply public API. |
| PHAiTO | Positions its output as clean/neutral; Lightroom-oriented workflow; advertises 1,000 trial images and $0.07/image. | Strong workflow and cost reference. Public information reviewed does not establish an embeddable API. |
| Imagen AI / Aftershoot / Neurapix | Profile-based batch editing and photographer workflow automation. | Useful references for profile training, batch UX and consistency; not automatically neutral correction or available as APIs. |
| Impossible Things / Things.co / FotoLab / Polarr Next / FilterPixel / Narrative | AI-assisted editing, batch workflow and/or culling are described in product material and user discussions. | Research candidates only. Confirm JPEG, neutral-only behavior, API/SDK, export rights, pricing and data terms before selecting. |

Vendor feature claims are not independent quality evidence. Record user reports with source, date, photographer workflow and test conditions; do not generalize a single review.

## What to reuse in Photo

- From Evoto: separate per-image auto correction, reference-based series matching and creative style transfer as distinct operations.
- From PHAiTO: make neutral technical base an explicit target before creative styling.
- From profile editors: learned looks may be optional later, never a prerequisite for neutralization.
- From batch workflows: per-image status, selective parameter sync, retry of failed items, resumable jobs and total-cost preview.
- From preset workflows: preserve source parameters, mark unsupported controls, and keep edits non-destructive.

## Implementation sequence

**A. Stabilize local editor:** immutable originals; project serialization; shared render function for preview/export; ZIP batch export plus manifest; explicit stage toggles. The current preview/export renderer now applies manual exposure, contrast, saturation, warmth, highlights and shadows in that order before the supported creative preset operations.

**B. Improve local analysis:** retain current luminance metrics as diagnostics, not AI truth; add luminance percentiles, clipping estimates and color-cast hints with confidence; avoid automatic removal of warm ambient light.

**C. Add provider jobs:** backend job API and adapter; verify API access, JPEG handling, pricing for 300 files, limits, privacy, retention and commercial terms before implementing a vendor connector. Preserve returned parameters when possible; otherwise mark output as a raster intermediate.

**D. Add creative/retouch integrations:** extend XMP/.costyle parsing only when semantics are understood and tested. Keep Reblum or another retouch tool as a separate stage, contingent on a supported integration method.

## Provider acceptance criteria

- JPEG input and batch processing confirmed.
- Neutral correction available without forced creative styling.
- Per-image result reliably linked to source asset ID.
- Known total cost for 300 images; no hidden export-credit gate.
- Supported API/SDK or documented automation interface, not desktop-only assumptions.
- Acceptable data retention, privacy, deletion and commercial-use terms.
- Partial failures, retries and cancellation do not invalidate successful outputs.

## Current repository state

The backend exposes bounded diagnostics at `POST /api/images/analyze` and conservative editable starting estimates at `POST /api/images/estimate`; tests cover synthetic statistics, estimate bounds/semantics and input validation, but have not yet been executed. The repository contains a React/Vite frontend with local object-URL loading, canvas preview and PNG export; basic luminance heuristics; XMP/.costyle parsing; and a FastAPI health endpoint. The frontend is connected to `/api/images/estimate`, exposes editable exposure/highlights/shadows controls, and supports configuring the backend origin with `VITE_API_BASE`. README states external AI calls are not connected. KIE.ai environment placeholders are not proof of a suitable neutralization API. Do not present provider integration as live until implemented and exercised.