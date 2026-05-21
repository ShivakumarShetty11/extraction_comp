import { useState } from 'react'
import FileUpload from './components/FileUpload'
import TableSidebar from './components/TableSidebar'
import TableViewer from './components/TableViewer'

const MODE_CONFIG = {
  direct_llm: {
    label: 'Direct LLM',
    endpoint: '/api/extract',
    badge: 'LLM',
    badgeClass: 'badge-llm',
    description: 'Single prompt → single response. One LLM API call per table.',
  },
  agent: {
    label: 'AI Agent',
    endpoint: '/api/extract-agent',
    badge: 'AGENT',
    badgeClass: 'badge-agent',
    description: 'ReAct loop with tools: scan rows → detect merges → build columns. Multiple steps per table.',
  },
}

export default function App() {
  const [mode, setMode] = useState('direct_llm')
  const [tables, setTables] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filename, setFilename] = useState('')
  const [resultMode, setResultMode] = useState(null)
  const [groups, setGroups] = useState(null)
  const [grouping, setGrouping] = useState(false)

  const handleUpload = async (file) => {
    setLoading(true)
    setError(null)
    setTables([])
    setSelectedId(null)
    setResultMode(null)
    setGroups(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(MODE_CONFIG[mode].endpoint, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(err.detail || 'Extraction failed')
      }
      const data = await res.json()
      setTables(data.tables)
      setFilename(data.filename)
      setResultMode(data.mode)
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
      // grouping is best-effort; leave groups null so flat list stays visible
    } finally {
      setGrouping(false)
    }
  }

  const selectedTable = tables.find((t) => t.id === selectedId)
  const cfg = MODE_CONFIG[mode]

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-icon">⊞</span>
          <span className="header-title">Table Extractor</span>
        </div>

        {/* Mode toggle */}
        <div className="mode-toggle">
          {Object.entries(MODE_CONFIG).map(([key, c]) => (
            <button
              key={key}
              className={`mode-btn ${mode === key ? 'mode-btn-active' : ''}`}
              onClick={() => { setMode(key); setTables([]); setSelectedId(null); setError(null); setGroups(null) }}
              disabled={loading}
              title={c.description}
            >
              <span className={`mode-dot ${key === 'agent' ? 'dot-agent' : 'dot-llm'}`} />
              {c.label}
            </button>
          ))}
        </div>

        <FileUpload onUpload={handleUpload} loading={loading} />
      </header>

      {/* Mode info bar */}
      <div className={`mode-bar ${mode === 'agent' ? 'mode-bar-agent' : 'mode-bar-llm'}`}>
        <span className={`mode-bar-badge ${cfg.badgeClass}`}>{cfg.badge}</span>
        <span className="mode-bar-desc">{cfg.description}</span>
      </div>

      <div className="app-body">
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">
              {mode === 'agent'
                ? 'AI Agent is running tool calls…'
                : 'Querying LLM…'}
            </p>
            <p className="loading-hint">
              {mode === 'agent'
                ? 'Agent uses scan → merge-detect → build-columns per table. May take 30–90 s.'
                : 'One LLM call per table. Usually 10–30 s.'}
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="error-banner"><strong>Error:</strong> {error}</div>
        )}

        {!loading && !error && tables.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <h2>Upload an Excel file to extract tables</h2>
            <p>Choose a mode above, then upload a <code>.xlsx</code> file.</p>
            <div className="comparison-cards">
              <div className="comp-card comp-card-llm">
                <div className="comp-card-title">⚡ Direct LLM</div>
                <ul>
                  <li>1 API call per table</li>
                  <li>Prompt → JSON response</li>
                  <li>Faster, no reasoning trace</li>
                </ul>
              </div>
              <div className="comp-card comp-card-agent">
                <div className="comp-card-title">🤖 AI Agent</div>
                <ul>
                  <li>Multi-step tool loop per table</li>
                  <li>scan → detect → build</li>
                  <li>Shows full reasoning chain</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {!loading && tables.length > 0 && (
          <div className="content-layout">
            <TableSidebar
              tables={tables}
              selectedId={selectedId}
              onSelect={setSelectedId}
              filename={filename}
              resultMode={resultMode}
              groups={groups}
              grouping={grouping}
              onGroup={handleGroup}
            />
            <main className="table-main">
              {selectedTable ? (
                <TableViewer table={selectedTable} resultMode={resultMode} />
              ) : (
                <div className="no-selection">Select a table from the sidebar</div>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  )
}
