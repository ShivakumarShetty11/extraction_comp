export default function TableSidebar({ tables, selectedId, onSelect, filename, resultMode }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-filename" title={filename}>📄 {filename}</div>
        <div className="sidebar-meta-row">
          <span className="sidebar-count">{tables.length} table{tables.length !== 1 ? 's' : ''}</span>
          {resultMode && (
            <span className={`sidebar-mode-badge ${resultMode === 'agent' ? 'badge-agent' : 'badge-llm'}`}>
              {resultMode === 'agent' ? '🤖 Agent' : '⚡ LLM'}
            </span>
          )}
        </div>
      </div>
      <div className="sidebar-list">
        {tables.map((tbl) => (
          <div
            key={tbl.id}
            className={`sidebar-item${tbl.id === selectedId ? ' active' : ''}`}
            onClick={() => onSelect(tbl.id)}
          >
            <div className="sidebar-item-title" title={tbl.title}>{tbl.title}</div>
            <div className="sidebar-item-meta">
              {tbl.sheet} · {tbl.row_count.toLocaleString()} rows · {tbl.columns.length} cols
              {tbl.agent_steps && (
                <span className="sidebar-steps-hint"> · {tbl.agent_steps.length} steps</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
