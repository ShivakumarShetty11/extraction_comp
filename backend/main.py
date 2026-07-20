import os
import pathlib
import json as _json
import asyncio
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

from extractor import TableExtractor
import catalogue as _cat

app = FastAPI(title="Table Extractor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_key = os.getenv("ANTHROPIC_API_KEY")
_direct = TableExtractor(api_key=_key)


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


@app.get("/api/catalogue/groups")
async def get_catalogue_groups():
    def _run():
        conn = _cat.get_connection()
        _cat.init_schema(conn)
        groups = _cat.list_metadata_groups(conn)
        conn.close()
        return groups
    try:
        groups = await asyncio.to_thread(_run)
        return {"groups": groups}
    except Exception as e:
        raise HTTPException(500, f"Catalogue error: {e}")


def _upload_excel_to_gcs(file_bytes: bytes, filename: str) -> str:
    """Upload Excel bytes to GCS and return the public gs:// URL."""
    from google.cloud import storage as gcs
    bucket_name = os.getenv("GCS_BUCKET_NAME", "")
    if not bucket_name:
        raise ValueError("GCS_BUCKET_NAME environment variable is not set")
    client = gcs.Client()
    bucket = client.bucket(bucket_name)
    blob_name = f"metadata_excel/{filename}"
    blob = bucket.blob(blob_name)
    blob.upload_from_string(file_bytes, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    return f"gs://{bucket_name}/{blob_name}"


@app.post("/api/catalogue/push")
async def push_to_catalogue(
    tables_json: str = Form(...),
    metadata_mode: str = Form(...),
    metadata_id: Optional[str] = Form(None),
    meta_title: Optional[str] = Form(None),
    meta_description: Optional[str] = Form(None),
    meta_product: Optional[str] = Form(None),
    meta_category: Optional[str] = Form(None),
    meta_geography: Optional[str] = Form(None),
    meta_frequency: Optional[str] = Form(None),
    meta_time_period: Optional[str] = Form(None),
    meta_data_source: Optional[str] = Form(None),
    meta_last_updated: Optional[str] = Form(None),
    meta_future_release: Optional[str] = Form(None),
    meta_key_statistics: Optional[str] = Form(None),
    meta_remarks: Optional[str] = Form(None),
    meta_excel: Optional[UploadFile] = File(None),
):
    tables = _json.loads(tables_json)

    # Upload Excel to GCS if provided
    excel_url = None
    if meta_excel and meta_excel.filename:
        excel_bytes = await meta_excel.read()
        if excel_bytes:
            try:
                excel_url = await asyncio.to_thread(
                    _upload_excel_to_gcs, excel_bytes, meta_excel.filename
                )
            except Exception as e:
                raise HTTPException(500, f"GCS upload error: {e}")

    # Per-table LLM enrichment (descriptions, classifications, units, age keys)
    def _enrich():
        return [_direct.enrich_for_catalogue(t) for t in tables]

    def _run(enriched_data):
        conn = _cat.get_connection()
        _cat.init_schema(conn)
        result = _cat.push_to_catalogue(
            conn, tables, enriched_data, metadata_mode, metadata_id,
            meta_title, meta_description, meta_product, meta_category,
            meta_geography, meta_frequency, meta_time_period,
            meta_data_source, meta_last_updated, meta_future_release,
            meta_key_statistics, meta_remarks, excel_url,
        )
        conn.close()
        return result

    try:
        enriched = await asyncio.to_thread(_enrich)
        result = await asyncio.to_thread(_run, enriched)
        return result
    except Exception as e:
        raise HTTPException(500, f"Push error: {e}")


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
