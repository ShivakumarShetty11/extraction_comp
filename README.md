# Table Extractor

AI-powered system to extract all tables from uploaded Excel files.
Uses Claude (claude-sonnet-4-6) to intelligently parse multi-level merged headers,
detect multiple tables per sheet, and return clean structured data.

## Project structure

```
extraction_comp/
├── backend/          FastAPI + openpyxl + Claude AI
│   ├── main.py
│   ├── extractor.py
│   ├── requirements.txt
│   └── .env          ← put your ANTHROPIC_API_KEY here
└── frontend/         React + Vite
    └── src/
        ├── App.jsx
        └── components/
            ├── FileUpload.jsx
            ├── TableSidebar.jsx
            └── TableViewer.jsx
```

## Setup

### 1. Set your API key

Edit `backend/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Features

- Upload any `.xlsx` file
- AI agent detects all tables — including multiple tables on one sheet
- Handles merged cells, multi-level column headers, vertically merged row cells
- Left sidebar lists all extracted tables with row/column counts
- Click a table to view it in a scrollable grid
- Download any table as CSV
- Shows first 500 rows in the UI; full data available via CSV download
