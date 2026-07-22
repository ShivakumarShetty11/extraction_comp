import { useState, useCallback, useRef } from 'react'
import FileUpload from './components/FileUpload'
import TableSidebar from './components/TableSidebar'
import TableViewer from './components/TableViewer'
import PushModal from './components/PushModal'

export default function App() {
  const [tables, setTables] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filename, setFilename] = useState('')
  const [groups, setGroups] = useState(null)
  const [grouping, setGrouping] = useState(false)
  const [pushOpen, setPushOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(270)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(0)

  const onResizeStart = useCallback((e) => {
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartW.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev) => {
      if (!dragging.current) return
      const delta = ev.clientX - dragStartX.current
      setSidebarWidth(Math.min(520, Math.max(160, dragStartW.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const resetResults = () => {
    setTables([])
    setSelectedId(null)
    setGroups(null)
  }

  const handleUpload = async (file) => {
    setLoading(true)
    setError(null)
    resetResults()

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/extract', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(err.detail || 'Extraction failed')
      }
      const data = await res.json()
      setTables(data.tables)
      setFilename(data.filename)
      if (data.tables.length > 0) setSelectedId(data.tables[0].id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGroup = async () => {
    setGrouping(true)
    try {
      const meta = tables.map(({ id, title, sheet, description }) => ({ id, title, sheet, description }))
      const res = await fetch('/api/group-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: meta }),
      })
      if (!res.ok) throw new Error('Grouping failed')
      const data = await res.json()
      setGroups(data.groups)
    } catch {
      // best-effort
    } finally {
      setGrouping(false)
    }
  }

  const selectedTable = tables.find((t) => t.id === selectedId)

  return (
    <div className="app">
      {/* ── Left navigation tab ── */}
      <nav className="left-nav">
        <div className="left-nav-brand">
          <span className="left-nav-icon">⊞</span>
          <div className="left-nav-title-block">
            <span className="left-nav-title">DHARA</span>
            <span className="left-nav-subtitle">TOOLKIT</span>
          </div>
        </div>

        <div className="left-nav-divider" />

        <div className="left-nav-section">
          <div className="left-nav-section-label">Dataset</div>
          <FileUpload onUpload={handleUpload} loading={loading} />
        </div>

        {filename && !loading && (
          <div className="left-nav-file" title={filename}>
            <span className="left-nav-file-icon">📄</span>
            <span className="left-nav-file-name">{filename}</span>
          </div>
        )}

        {tables.length > 0 && !loading && (
          <div className="left-nav-stats">
            {tables.length} table{tables.length !== 1 ? 's' : ''} extracted
          </div>
        )}
      </nav>

      {/* ── Main content ── */}
      <div className="app-main">
        <div className="app-topbar">
          <a
            href="https://des-website-235956738573.asia-south1.run.app"
            target="_blank"
            rel="noopener noreferrer"
            className="view-catalogue-btn"
          >
            View Catalogue ↗
          </a>
        </div>
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">Querying LLM…</p>
            <p className="loading-hint">One LLM call per table. Usually 10–30 s.</p>
          </div>
        )}

        {!loading && error && (
          <div className="error-banner"><strong>Error:</strong> {error}</div>
        )}

        {!loading && !error && tables.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <h2>Upload an Excel file to extract tables</h2>
            <p>Use the <strong>Upload Dataset</strong> button on the left to get started.</p>
          </div>
        )}

        {!loading && tables.length > 0 && (
          <div className="content-layout">
            <TableSidebar
              tables={tables}
              selectedId={selectedId}
              onSelect={setSelectedId}
              filename={filename}
              groups={groups}
              grouping={grouping}
              onGroup={handleGroup}
              onPush={() => setPushOpen(true)}
              width={sidebarWidth}
            />
            <div className="resize-handle" onMouseDown={onResizeStart} title="Drag to resize" />
            <main className="table-main">
              {selectedTable ? (
                <TableViewer table={selectedTable} />
              ) : (
                <div className="no-selection">Select a table from the sidebar</div>
              )}
            </main>
          </div>
        )}
      </div>

      {pushOpen && <PushModal tables={tables} groups={groups} onClose={() => setPushOpen(false)} />}
    </div>
  )
}
