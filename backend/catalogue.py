import os
import re
import uuid
import json
from datetime import date

import psycopg2
import psycopg2.extras


# Standard metadata quality concepts used across all DES catalogue records
STANDARD_CONCEPTS = [
    "Contact",
    "Data description and Presentation",
    "Data Processing",
    "Data Analysis",
    "Dissemination",
    "Quality",
    "Meta data update",
    "Institutional Mandate",
    "Accuracy and Reliability",
    "Timeliness",
    "Coherence/Comparability",
]


def get_connection():
    url = os.environ["DATABASE_URL"]
    return psycopg2.connect(url)


def init_schema(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS metadata_groups (
                metadata_id       TEXT PRIMARY KEY,
                title             TEXT,
                description       TEXT,
                product           TEXT,
                category          TEXT,
                geography         TEXT,
                frequency         TEXT,
                time_period       TEXT,
                data_source       TEXT,
                last_updated_date TEXT,
                future_release    TEXT,
                key_statistics    TEXT,
                remarks           TEXT,
                metadata_excel    TEXT,
                table_ids         TEXT[],
                classifications   JSONB DEFAULT '{}',
                concepts          TEXT[] DEFAULT '{}',
                full_record       JSONB DEFAULT '{}'
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS datasets (
                dataset_id         TEXT PRIMARY KEY,
                unique_dataset_id  TEXT,
                table_id           TEXT,
                metadata_id        TEXT REFERENCES metadata_groups,
                title              TEXT,
                short_description  TEXT,
                long_description   TEXT,
                category           TEXT,
                geography          TEXT,
                frequency          TEXT,
                time_period        TEXT,
                data_source        TEXT,
                units              TEXT,
                classifications    JSONB DEFAULT '{}',
                concepts           TEXT[] DEFAULT '{}',
                age_column_keys    JSONB DEFAULT '{}'
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS dataset_rows (
                id         SERIAL PRIMARY KEY,
                dataset_id TEXT REFERENCES datasets ON DELETE CASCADE,
                sl_no      TEXT,
                row_index  INTEGER,
                row_data   JSONB NOT NULL
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_datasets_metadata_id
                ON datasets (metadata_id)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_dataset_rows_dataset_id
                ON dataset_rows (dataset_id)
        """)
    conn.commit()


def list_metadata_groups(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT
                metadata_id,
                title,
                description,
                category,
                geography,
                frequency,
                time_period,
                data_source,
                array_length(table_ids, 1) AS table_count
            FROM metadata_groups
            ORDER BY title
        """)
        rows = cur.fetchall()
    return [dict(r) for r in rows]


def _extract_table_code(title: str) -> str:
    """Pull short table code like 'D-3', 'T-01', '1.1' from a table title."""
    m = re.search(r"\b([A-Z]-\d+(?:\.\d+)?|\d+\.\d+)\b", title or "", re.IGNORECASE)
    return m.group(1).upper() if m else ""


def _make_dataset_id(table: dict, index: int) -> str:
    """Short human-readable dataset_id: prefer extracted code, else counter."""
    code = _extract_table_code(table.get("title", ""))
    suffix = uuid.uuid4().hex[:6]
    if code:
        return f"{code}-{suffix}"
    return f"DS-{index+1:03d}-{suffix}"


def _make_unique_dataset_id(table: dict, meta_category: str, meta_time_period: str, index: int) -> str:
    """DDI-style unique ID: DDI_IND_DES_{CATEGORY}_{TABLE}_{YEAR}_V1"""
    cat_slug = re.sub(r"[^A-Z0-9]", "_", (meta_category or "DATA").upper())[:12]
    code = _extract_table_code(table.get("title", ""))
    table_slug = re.sub(r"[^A-Z0-9]", "", code.upper()) if code else f"T{index+1:02d}"
    year_m = re.search(r"\b(20\d{2})\b", meta_time_period or "")
    year = year_m.group(1) if year_m else date.today().strftime("%Y")
    return f"DDI_IND_DES_{cat_slug}_{table_slug}_{year}_V1"


def _extract_sl_no(row: dict, row_index: int) -> str:
    """Try to find the serial number value from a row dict."""
    for key in ("sl_no", "Sl. No.", "S.No.", "Sr.No.", "S.No", "SL NO", "Sl No"):
        if key in row:
            return str(row[key])
    # check the first column value — if it looks like a serial number use it
    if row:
        first_val = next(iter(row.values()), None)
        if first_val is not None and re.match(r"^\d+$", str(first_val).strip()):
            return str(first_val)
    return str(row_index + 1)


def push_to_catalogue(
    conn,
    tables,
    enriched_data,       # list[dict] parallel to tables, from extractor.enrich_for_catalogue
    metadata_mode,
    metadata_id,
    meta_title,
    meta_description,
    meta_product,
    meta_category,
    meta_geography,
    meta_frequency,
    meta_time_period,
    meta_data_source,
    meta_future_release,
    meta_key_statistics,
    meta_remarks,
    meta_excel_filename,
):
    today = date.today().strftime("%B, %Y")   # e.g. "July, 2025"
    dataset_ids = []
    table_id_codes = []

    with conn.cursor() as cur:
        # ── Insert all datasets + rows ──────────────────────────────────────
        for i, table in enumerate(tables):
            enriched = enriched_data[i] if i < len(enriched_data) else {}

            ds_id = _make_dataset_id(table, i)
            unique_ds_id = _make_unique_dataset_id(table, meta_category, meta_time_period, i)
            table_code = _extract_table_code(table.get("title", "")) or f"T-{i+1:02d}"
            dataset_ids.append(ds_id)
            table_id_codes.append(table_code)

            columns = table.get("columns", [])
            rows = table.get("rows", [])

            # Merge classifications from enriched data
            classifications = enriched.get("classifications") or {}
            age_column_keys = enriched.get("age_column_keys") or {}

            cur.execute("""
                INSERT INTO datasets (
                    dataset_id, unique_dataset_id, table_id, metadata_id,
                    title, short_description, long_description,
                    category, geography, frequency, time_period,
                    data_source, units, classifications, concepts, age_column_keys
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s, %s
                )
            """, (
                ds_id,
                unique_ds_id,
                table_code,
                metadata_id if metadata_mode == "existing" else None,
                table.get("title", ""),
                enriched.get("short_description") or table.get("description", ""),
                enriched.get("long_description") or table.get("description", ""),
                meta_category,
                meta_geography,
                meta_frequency,
                meta_time_period,
                meta_data_source,
                enriched.get("units") or "Count",
                json.dumps(classifications),
                STANDARD_CONCEPTS,
                json.dumps(age_column_keys),
            ))

            for row_index, row in enumerate(rows):
                cur.execute("""
                    INSERT INTO dataset_rows (dataset_id, sl_no, row_index, row_data)
                    VALUES (%s, %s, %s, %s)
                """, (
                    ds_id,
                    _extract_sl_no(row, row_index),
                    row_index,
                    json.dumps(row, default=str),
                ))

        # ── Handle metadata group ───────────────────────────────────────────
        if metadata_mode == "new":
            metadata_id = f"AUTO-{re.sub(r'[^A-Z0-9]', '-', (meta_title or 'DATA').upper())[:20]}-{uuid.uuid4().hex[:6]}"

            # Build full_record to mirror DES catalogue JSON file structure
            full_record = {
                "metadata": {
                    "metadata_id": metadata_id,
                    "title": meta_title,
                    "description": meta_description,
                    "product": meta_product,
                    "category": meta_category,
                    "geography": meta_geography,
                    "frequency": meta_frequency,
                    "time_period": meta_time_period,
                    "data_source": meta_data_source,
                    "last_updated_date": today,
                    "future_release": meta_future_release,
                    "key_statistics": meta_key_statistics,
                    "remarks": meta_remarks,
                    "metadata_excel": meta_excel_filename,
                    "table_ids": table_id_codes,
                },
                "classifications": _merge_classifications(enriched_data),
                "concepts": STANDARD_CONCEPTS,
                "dataset_inventory_list": [
                    {
                        "dataset_id": dataset_ids[j],
                        "table_id": table_id_codes[j],
                        "title": tables[j].get("title", ""),
                        "short_description": (enriched_data[j].get("short_description") if j < len(enriched_data) else "") or "",
                        "long_description": (enriched_data[j].get("long_description") if j < len(enriched_data) else "") or "",
                    }
                    for j in range(len(tables))
                ],
            }

            cur.execute("""
                INSERT INTO metadata_groups (
                    metadata_id, title, description, product, category, geography,
                    frequency, time_period, data_source, last_updated_date,
                    future_release, key_statistics, remarks,
                    metadata_excel, table_ids, classifications, concepts, full_record
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s
                )
            """, (
                metadata_id,
                meta_title,
                meta_description,
                meta_product,
                meta_category,
                meta_geography,
                meta_frequency,
                meta_time_period,
                meta_data_source,
                today,
                meta_future_release,
                meta_key_statistics,
                meta_remarks,
                meta_excel_filename,
                dataset_ids,
                json.dumps(_merge_classifications(enriched_data)),
                STANDARD_CONCEPTS,
                json.dumps(full_record),
            ))

            # Back-fill metadata_id on datasets just inserted
            cur.execute("""
                UPDATE datasets SET metadata_id = %s
                WHERE dataset_id = ANY(%s)
            """, (metadata_id, dataset_ids))

        else:
            # existing group: append new dataset_ids to table_ids array
            cur.execute("""
                UPDATE metadata_groups
                SET table_ids        = array_cat(COALESCE(table_ids, '{}'), %s),
                    last_updated_date = %s
                WHERE metadata_id = %s
            """, (dataset_ids, today, metadata_id))

    conn.commit()

    return {
        "metadata_id": metadata_id,
        "dataset_ids": dataset_ids,
        "tables_pushed": len(tables),
    }


def _merge_classifications(enriched_data: list) -> dict:
    """Merge classifications across all enriched tables, deduplicating values per dimension."""
    merged: dict = {}
    for enriched in enriched_data:
        cls = enriched.get("classifications") or {}
        for dim, vals in cls.items():
            if dim not in merged:
                merged[dim] = []
            for v in vals:
                if v not in merged[dim]:
                    merged[dim].append(v)
    return merged
