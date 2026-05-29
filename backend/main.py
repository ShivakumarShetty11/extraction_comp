import os
import pathlib

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

from extractor import TableExtractor

app = FastAPI(title="Table Extractor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_key = os.getenv("ANTHROPIC_API_KEY")
_direct = TableExtractor(api_key=_key, use_agent=False)
_agent  = TableExtractor(api_key=_key, use_agent=True)


def _read_file(file: UploadFile) -> bytes:
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only .xlsx / .xls files are supported")
    if file.filename.lower().endswith(".xls"):
        raise HTTPException(
            400,
            "Legacy .xls format is not supported. Re-save the file as .xlsx in Excel.",
        )
    return None  # signal to caller to await


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/extract")
async def extract_direct(file: UploadFile = File(...)):
    """Direct LLM mode — single prompt → single response per table."""
    if not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(400, "Only .xlsx files are supported (re-save .xls as .xlsx)")
    content = await file.read()
    try:
        tables = _direct.extract_from_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Extraction error: {e}")
    return {"filename": file.filename, "mode": "direct_llm", "table_count": len(tables), "tables": tables}


@app.post("/api/extract-agent")
async def extract_agent(file: UploadFile = File(...)):
    """AI Agent mode — ReAct loop with tool calling per table."""
    if not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(400, "Only .xlsx files are supported (re-save .xls as .xlsx)")
    content = await file.read()
    try:
        tables = _agent.extract_from_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Extraction error: {e}")
    return {"filename": file.filename, "mode": "agent", "table_count": len(tables), "tables": tables}


@app.post("/api/table-metadata")
async def table_metadata(request: Request):
    """LLM-based semantic category extraction from a table's raw structure."""
    data = await request.json()
    try:
        categories = _direct.extract_category_metadata(
            title=data.get("title", ""),
            description=data.get("description", ""),
            raw_header_rows=data.get("raw_header_rows", []),
            columns=data.get("columns", []),
            sample_rows=data.get("sample_rows", []),
            raw_notes=data.get("raw_notes", []),
        )
    except Exception as e:
        raise HTTPException(500, f"Metadata extraction error: {e}")
    return {"categories": categories}


@app.post("/api/detect-linkages")
async def detect_linkages(request: Request):
    """Detect shared categorical dimensions across tables that can be used as join keys."""
    data = await request.json()
    tables_meta = data.get("tables", [])
    try:
        linkages = _direct.detect_linkages(tables_meta)
    except Exception as e:
        raise HTTPException(500, f"Linkage detection error: {e}")
    return {"linkages": linkages}


@app.post("/api/group-tables")
async def group_tables(request: Request):
    """Cluster extracted tables by semantic similarity using Claude."""
    data = await request.json()
    tables_meta = data.get("tables", [])
    try:
        groups = _direct.group_tables_by_similarity(tables_meta)
    except Exception as e:
        raise HTTPException(500, f"Grouping error: {e}")
    return {"groups": groups}


# --- Serve React frontend (production) ---
_static_dir = pathlib.Path(__file__).parent / "static"
_assets_dir = _static_dir / "assets"
_index_html = _static_dir / "index.html"

if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if _index_html.exists():
        return FileResponse(str(_index_html))
    raise HTTPException(404, "Frontend not built. Run: cd frontend && npm run build")
