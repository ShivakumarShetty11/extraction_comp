function TableItem({ tbl, selectedId, onSelect }) {
  return (
    <div
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
  )
}

export default function TableSidebar({ tables, selectedId, onSelect, filename, resultMode, groups, grouping, onGroup }) {
  const tableMap = Object.fromEntries(tables.map(t => [t.id, t]))

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
        <button
          className={`group-btn${grouping ? ' group-btn-loading' : ''}`}
          onClick={onGroup}
          disabled={grouping}
          title="Ask Claude to group similar tables by topic"
        >
          {grouping ? 'Grouping…' : groups ? '↻ Regroup' : '⊹ Group Similar'}
        </button>
      </div>

      <div className="sidebar-list">
        {groups ? (
          groups.map(group => (
            <div key={group.name} className="sidebar-group">
              <div className="sidebar-group-header">{group.name}</div>
              {group.table_ids.map(id => {
                const tbl = tableMap[id]
                return tbl ? (
                  <TableItem key={id} tbl={tbl} selectedId={selectedId} onSelect={onSelect} />
                ) : null
              })}
            </div>
          ))
        ) : (
          tables.map(tbl => (
            <TableItem key={tbl.id} tbl={tbl} selectedId={selectedId} onSelect={onSelect} />
          ))
        )}
      </div>
    </aside>
  )
}
