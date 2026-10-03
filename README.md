# Photo AI Editor

Browser-first prototype for batch photo review and image adjustments. Windows desktop packaging (Tauri) is a later phase.

## Current scope
- Multi-image upload for JPEG, PNG and WebP in the browser
- Contact-sheet thumbnails and a selected-image preview
- Non-destructive preview controls for exposure, contrast, saturation and warmth
- FastAPI health endpoint
- KIE.ai provider configuration placeholder; no external AI calls are made yet

The current adjustment controls are a browser preview, not a rendered/exported image. AI analysis, technical neutralization, creative grading, retouching, project persistence and export are planned follow-on stages.

## Run locally
### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
API: http://127.0.0.1:8000/health

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open the local URL printed by Vite. The frontend currently runs independently of the API.

## KIE.ai
Copy `.env.example` to `.env` in the backend when integration is implemented. Keep credentials server-side; never commit API keys or expose them in browser code.
