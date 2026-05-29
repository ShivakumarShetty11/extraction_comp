import { useState } from 'react'
import * as XLSX from 'xlsx'

// ── Metadata Excel helpers ──────────────────────────────────────────────────

function safeSheetName(name, usedNames) {
  let safe = name.replace(/[/\\?*[\]:]/g, '_').slice(0, 31)
  if (!safe.trim()) safe = 'Sheet'
  if (usedNames.has(safe)) {
    let n = 2
    while (usedNames.has(`${safe.slice(0, 27)}_${n}`)) n++
    safe = `${safe.slice(0, 27)}_${n}`
  }
  usedNames.add(safe)
  return safe
}

function inferType(colName, rows) {
  const vals = rows.map((r) => r[colName]).filter((v) => v != null && v !== '')
  if (!vals.length) return 'Empty'
  const numCount = vals.filter((v) => !isNaN(Number(v)) && String(v).trim() !== '').length
  if (numCount === vals.length) return 'Numeric'
  if (numCount > vals.length / 2) return 'Mixed'
  return 'Text'
}

function numericStats(colName, rows) {
  const nums = rows
    .map((r) => r[colName])
    .filter((v) => v != null && !isNaN(Number(v)) && String(v).trim() !== '')
    .map(Number)
  if (!nums.length) return { min: '', max: '', avg: '', count: 0 }
  const sum = nums.reduce((a, b) => a + b, 0)
  return { min: Math.min(...nums), max: Math.max(...nums), avg: (sum / nums.length).toFixed(2), count: nums.length }
}

async function downloadGroupMetadata(group, tableMap, setGroupMeta) {
  const tables = group.table_ids.map((id) => tableMap[id]).filter(Boolean)
  if (!tables.length) return

  setGroupMeta((prev) => ({ ...prev, [group.name]: true }))
  try {
    const allCategories = []
    for (const table of tables) {
      const res = await fetch('/api/table-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: table.title,
          description: table.description || '',
          raw_header_rows: table.raw_header_rows || [],
          columns: table.columns,
          sample_rows: table.rows.slice(0, 8),
          raw_notes: table.raw_notes || [],
        }),
      })
      if (!res.ok) continue
      const { categories } = await res.json()
      allCategories.push(...(categories || []))
    }

    const seenCatNames = new Set()
    const mergedCategories = allCategories.filter((cat) => {
      const key = (cat.name ?? '').toLowerCase().trim()
      if (!key || seenCatNames.has(key)) return false
      seenCatNames.add(key)
      return true
    })

    const wb = XLSX.utils.book_new()
    const usedSheetNames = new Set()

    const overviewMatrix = [
      ['Group', group.name],
      ['Tables', tables.length],
      ['Categories', mergedCategories.length],
      [],
    ]

    for (const table of tables) {
      overviewMatrix.push(
        [`── ${table.title} ──`],
        ['Sheet', table.sheet, 'Rows', table.row_count, 'Columns', table.columns.length],
        [],
        ['#', 'Column Name', 'Data Type', 'Unique / Min', 'Max', 'Avg', 'Non-null Count'],
      )
      table.columns.forEach((col, i) => {
        const type = inferType(col, table.rows)
        if (type === 'Numeric' || type === 'Mixed') {
          const s = numericStats(col, table.rows)
          overviewMatrix.push([i + 1, col, type, s.min, s.max, s.avg, s.count])
        } else {
          const uniq = new Set(table.rows.map((r) => r[col]).filter((v) => v != null && v !== ''))
          const nonNull = table.rows.filter((r) => r[col] != null && r[col] !== '').length
          overviewMatrix.push([i + 1, col, type, uniq.size, '', '', nonNull])
        }
      })
      if (table.raw_notes?.length) {
        overviewMatrix.push([], ['Notes:'])
        table.raw_notes.forEach((n) => overviewMatrix.push([n]))
      }
      overviewMatrix.push([])
    }

    const wsOv = XLSX.utils.aoa_to_sheet(overviewMatrix)
    wsOv['!cols'] = [{ wch: 26 }, { wch: 42 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsOv, safeSheetName('Overview', usedSheetNames))

    for (const cat of mergedCategories) {
      if (!cat.values?.length) continue
      const seenVals = new Set()
      const uniqueValues = cat.values.filter((v) => {
        const key = (v.value ?? '').toLowerCase().trim()
        if (!key || seenVals.has(key)) return false
        seenVals.add(key)
        return true
      })
      const matrix = [
        [cat.name],
        [cat.description || ''],
        [],
        ['Value', 'Code', 'Description'],
        ...uniqueValues.map((v) => [v.value ?? '', v.code ?? '', v.description ?? '']),
      ]
      const ws = XLSX.utils.aoa_to_sheet(matrix)
      ws['!cols'] = [{ wch: 30 }, { wch: 26 }, { wch: 65 }]
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(cat.name, usedSheetNames))
    }

    const safe = group.name.replace(/[/\\?%*:|"<>[\]]/g, '_').slice(0, 55)
    XLSX.writeFile(wb, `${safe}_metadata.xlsx`)
  } catch (err) {
    alert(`Group metadata failed: ${err.message}`)
  } finally {
    setGroupMeta((prev) => ({ ...prev, [group.name]: false }))
  }
}

// ── Sub-components ──────────────────────────────────────────────────────────

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

function LinkageSection({ linkages, linkageLoading, onDetectLinkages, onJoin, tableMap }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="linkage-section">
      <div className="linkage-section-header">
        <button className="linkage-toggle" onClick={() => setCollapsed((v) => !v)}>
          <span className="linkage-toggle-icon">{collapsed ? '▶' : '▼'}</span>
          <span className="linkage-toggle-label">Linkages</span>
          {linkages && <span className="linkage-count">{linkages.length}</span>}
        </button>
        <button
          className={`detect-btn${linkageLoading ? ' detect-btn-loading' : ''}`}
          onClick={onDetectLinkages}
          disabled={linkageLoading}
          title="Ask Claude to find shared categorical dimensions across all tables"
        >
          {linkageLoading ? '…' : linkages ? '↻' : 'Detect'}
        </button>
      </div>

      {!collapsed && (
        <div className="linkage-list">
          {!linkages && !linkageLoading && (
            <div className="linkage-hint">
              Click Detect to find join dimensions shared across tables (e.g. Area Type, Gender).
            </div>
          )}
          {linkages && linkages.length === 0 && (
            <div className="linkage-hint">No shared dimensions found.</div>
          )}
          {linkages && linkages.map((lnk) => (
            <div key={lnk.canonical} className="linkage-item">
              <div className="linkage-item-top">
                <span className="linkage-dim-name">{lnk.dimension}</span>
                <button
                  className="join-open-btn"
                  onClick={() => onJoin(lnk)}
                  title={`Join tables on ${lnk.dimension}`}
                >
                  Join
                </button>
              </div>
              <div className="linkage-item-desc">{lnk.description}</div>
              <div className="linkage-item-tables">
                {lnk.table_links.map((tl) => (
                  <span key={tl.table_id} className="linkage-table-chip" title={`col: ${tl.column}`}>
                    {tableMap[tl.table_id]?.title?.slice(0, 22) || tl.table_id}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main export ─────────────────────────────────────────────────────────────

export default function TableSidebar({
  tables, selectedId, onSelect, filename, resultMode,
  groups, grouping, onGroup,
  linkages, linkageLoading, onDetectLinkages, onJoin,
}) {
  const [groupMeta, setGroupMeta] = useState({})
  const tableMap = Object.fromEntries(tables.map((t) => [t.id, t]))

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
          groups.map((group) => {
            const isLoading = !!groupMeta[group.name]
            return (
              <div key={group.name} className="sidebar-group">
                <div className="sidebar-group-header">
                  <span className="sidebar-group-name">{group.name}</span>
                  <button
                    className={`group-meta-btn${isLoading ? ' group-meta-btn-loading' : ''}`}
                    disabled={isLoading}
                    onClick={() => downloadGroupMetadata(group, tableMap, setGroupMeta)}
                    title={`Download metadata for all "${group.name}" tables`}
                  >
                    {isLoading ? '⏳' : '⬇ Metadata'}
                  </button>
                </div>
                {group.table_ids.map((id) => {
                  const tbl = tableMap[id]
                  return tbl ? (
                    <TableItem key={id} tbl={tbl} selectedId={selectedId} onSelect={onSelect} />
                  ) : null
                })}
              </div>
            )
          })
        ) : (
          tables.map((tbl) => (
            <TableItem key={tbl.id} tbl={tbl} selectedId={selectedId} onSelect={onSelect} />
          ))
        )}
      </div>

      <LinkageSection
        linkages={linkages}
        linkageLoading={linkageLoading}
        onDetectLinkages={onDetectLinkages}
        onJoin={onJoin}
        tableMap={tableMap}
      />
    </aside>
  )
}
