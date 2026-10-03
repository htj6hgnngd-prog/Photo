from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .providers import provider_status
from .image_analysis import ImageAnalysisError, analyze_image_bytes

app = FastAPI(title="Photo AI Editor API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "photo-ai-editor", "version": "0.1.0"}


@app.get("/api/providers/neutralization")
def neutralization_provider_status():
    """Expose configured neutralization capability without claiming AI is live."""
    return provider_status()



@app.post("/api/images/analyze")
async def analyze_uploaded_image(file: UploadFile = File(...)):
    """Return bounded pixel diagnostics; this endpoint does not alter the image."""
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WEBP are supported.")
    data = await file.read(25 * 1024 * 1024 + 1)
    try:
        return analyze_image_bytes(data)
    except ImageAnalysisError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
