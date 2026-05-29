import { useState, useMemo } from 'react'

const MAX_JOIN_ROWS = 500

const TOTAL_STRINGS = new Set([
  'TOTAL', 'ALL', 'GRAND TOTAL', 'BOTH', 'PERSONS',
  'ALL AREAS', 'COMBINED', 'ALL SEXES', 'ALL AGES',
])

function escape(v) {
  const s = v == null ? '' : String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function downloadCSV(columns, rows, name) {
  const header = columns.map(escape).join(',')
  const body = rows.map((row) => columns.map((c) => escape(row[c])).join(','))
  const blob = new Blob(['﻿' + [header, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[/\\?%*:|"<>]/g, '_')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Normalise a raw cell value using the value_map.
 * Falls back to the uppercased raw string when the value isn't in the map,
 * so unmapped categories (e.g. occupation strings) still join correctly.
 */
function normalize(valueMap, raw) {
  if (raw == null) return null
  const key = String(raw).trim()
  if (!key) return null
  // Explicit map entry wins
  const mapped = valueMap[key] ?? valueMap[raw]
  if (mapped !== undefined) return mapped
  // Unmapped totals
  if (TOTAL_STRINGS.has(key.toUpperCase())) return '__TOTAL__'
  // Fallback: use raw value uppercased for consistent cross-table matching
  return key.toUpperCase()
}

function isTotal(val) {
  return TOTAL_STRINGS.has(String(val ?? '').trim().toUpperCase())
}

/**
 * Compound-key inner join.
 * linkA/linkB  = { column, value_map }       primary dimension
 * additionalKeys = [{ colA, colB }]           extra columns that must also match
 */
function computeJoin(tableA, tableB, linkA, linkB, additionalKeys) {
  if (!tableA || !tableB || !linkA || !linkB) return null

  const makeKey = (row, link, addPairs) => {
    const norm = normalize(link.value_map, row[link.column])
    if (!norm || norm === '__TOTAL__') return null
    const extras = addPairs.map(({ col }) => {
      const v = String(row[col] ?? '').trim()
      if (isTotal(v)) return null
      return v.toUpperCase()
    })
    if (extras.some((v) => v === null)) return null
    return [norm, ...extras].join('|||')
  }

  const groupA = {}
  for (const row of tableA.rows) {
    const key = makeKey(row, linkA, additionalKeys.map(({ colA }) => ({ col: colA })))
    if (key) (groupA[key] = groupA[key] || []).push(row)
  }
  const groupB = {}
  for (const row of tableB.rows) {
    const key = makeKey(row, linkB, additionalKeys.map(({ colB }) => ({ col: colB })))
    if (key) (groupB[key] = groupB[key] || []).push(row)
  }

  const commonKeys = Object.keys(groupA).filter((k) => groupB[k])
  if (!commonKeys.length) {
    return {
      columns: [], rows: [], matchedKeys: 0, isCrossProduct: false,
      warning: 'No matching rows found. Check the value map or add more match columns.',
    }
  }

  const addColsA = additionalKeys.map((k) => k.colA)
  const addColsB = additionalKeys.map((k) => k.colB)
  const otherA = tableA.columns.filter((c) => c !== linkA.column && !addColsA.includes(c))
  const otherB = tableB.columns.filter((c) => c !== linkB.column && !addColsB.includes(c))

  const otherBNames = new Set(otherB)
  const prefA = (c) => (otherBNames.has(c) ? `A: ${c}` : c)
  const prefB = (c) => (otherA.includes(c) ? `B: ${c}` : c)

  const resultCols = [linkA.column, ...addColsA, ...otherA.map(prefA), ...otherB.map(prefB)]

  const resultRows = []
  for (const key of commonKeys) {
    const parts = key.split('|||')
    for (const rA of groupA[key]) {
      for (const rB of groupB[key]) {
        const row = { [linkA.column]: parts[0] }
        addColsA.forEach((c, i) => { row[c] = parts[i + 1] ?? rA[c] })
        otherA.forEach((c) => { row[prefA(c)] = rA[c] })
        otherB.forEach((c) => { row[prefB(c)] = rB[c] })
        resultRows.push(row)
      }
    }
  }

  const isCrossProduct = commonKeys.some(
    (k) => groupA[k].length > 1 || groupB[k].length > 1
  )

  return { columns: resultCols, rows: resultRows, matchedKeys: commonKeys.length, isCrossProduct, warning: null }
}

function sharedColumns(tableA, tableB, excludeA, excludeB) {
  if (!tableA || !tableB) return []
  const setB = new Set(tableB.columns.filter((c) => !excludeB.includes(c)))
  return tableA.columns.filter((c) => !excludeA.includes(c) && setB.has(c))
}

// ── Component ───────────────────────────────────────────────────────────────

export default function JoinViewer({ tables, joinConfig, onClose }) {
  const { linkage } = joinConfig
  const tableIds = linkage.table_links.map((tl) => tl.table_id)
  const tableMap = Object.fromEntries(tables.map((t) => [t.id, t]))
  const linkMap = Object.fromEntries(linkage.table_links.map((tl) => [tl.table_id, tl]))

  const [tableAId, setTableAId] = useState(tableIds[0] || '')
  const [tableBId, setTableBId] = useState(tableIds[1] || '')
  const [additionalKeys, setAdditionalKeys] = useState([])

  const tableA = tableMap[tableAId]
  const tableB = tableMap[tableBId]
  const linkA = linkMap[tableAId]
  const linkB = linkMap[tableBId]

  const selectA = (id) => { setTableAId(id); setAdditionalKeys([]) }
  const selectB = (id) => { setTableBId(id); setAdditionalKeys([]) }

  const shared = useMemo(
    () => sharedColumns(
      tableA, tableB,
      [linkA?.column, ...additionalKeys.map((k) => k.colA)],
      [linkB?.column, ...additionalKeys.map((k) => k.colB)],
    ),
    [tableAId, tableBId, additionalKeys]
  )

  const addKey = (colA, colB) => setAdditionalKeys((prev) => [...prev, { colA, colB }])
  const removeKey = (i) => setAdditionalKeys((prev) => prev.filter((_, j) => j !== i))
  const updateKey = (i, field, val) =>
    setAdditionalKeys((prev) => prev.map((k, j) => j === i ? { ...k, [field]: val } : k))

  const result = useMemo(
    () => computeJoin(tableA, tableB, linkA, linkB, additionalKeys),
    [tableAId, tableBId, additionalKeys]
  )

  const displayRows = result?.rows?.slice(0, MAX_JOIN_ROWS) || []
  const keyCols = [linkA?.column, ...additionalKeys.map((k) => k.colA)].filter(Boolean)
  const joinName = `${linkage.dimension} — ${tableA?.title || ''} × ${tableB?.title || ''}`

  return (
    <div className="join-viewer">
      {/* ── Header ── */}
      <div className="join-header">
        <button className="join-back-btn" onClick={onClose}>← Back</button>
        <div className="join-header-info">
          <span className="join-dimension-label">Join on: <strong>{linkage.dimension}</strong></span>
          {linkage.description && <span className="join-dimension-desc"> — {linkage.description}</span>}
        </div>
      </div>

      {/* ── Table selectors ── */}
      <div className="join-config-bar">
        <div className="join-selector-group">
          <label className="join-selector-label">Table A</label>
          <select className="join-select" value={tableAId} onChange={(e) => selectA(e.target.value)}>
            {tableIds.map((id) => (
              <option key={id} value={id} disabled={id === tableBId}>
                {tableMap[id]?.title || id}
              </option>
            ))}
          </select>
          {linkA && (
            <div className="join-col-info">
              col: <code>{linkA.column}</code>
              <span className="join-vmap-preview">
                {Object.entries(linkA.value_map).filter(([, v]) => v !== '__TOTAL__')
                  .slice(0, 3).map(([k, v]) => `${k}→${v}`).join(', ')}
                {Object.keys(linkA.value_map).length > 3 && ' …'}
              </span>
            </div>
          )}
        </div>

        <div className="join-x-symbol">×</div>

        <div className="join-selector-group">
          <label className="join-selector-label">Table B</label>
          <select className="join-select" value={tableBId} onChange={(e) => selectB(e.target.value)}>
            {tableIds.map((id) => (
              <option key={id} value={id} disabled={id === tableAId}>
                {tableMap[id]?.title || id}
              </option>
            ))}
          </select>
          {linkB && (
            <div className="join-col-info">
              col: <code>{linkB.column}</code>
              <span className="join-vmap-preview">
                {Object.entries(linkB.value_map).filter(([, v]) => v !== '__TOTAL__')
                  .slice(0, 3).map(([k, v]) => `${k}→${v}`).join(', ')}
                {Object.keys(linkB.value_map).length > 3 && ' …'}
              </span>
            </div>
          )}
        </div>
      </div>

      {tableAId === tableBId && (
        <div className="join-warning">Select two different tables to join.</div>
      )}

      {/* ── Compound key refinement ── */}
      {tableAId !== tableBId && tableA && tableB && (
        <div className="join-refine-bar">
          <div className="join-refine-title">
            {result?.isCrossProduct
              ? '⚠ Multiple rows per key — add more match columns to resolve the cross-product:'
              : 'Also match on (optional compound key):'}
          </div>

          {additionalKeys.map((pair, i) => (
            <div key={i} className="join-key-pair">
              <select className="join-select-sm" value={pair.colA}
                onChange={(e) => updateKey(i, 'colA', e.target.value)}>
                {tableA.columns.filter((c) => c !== linkA?.column).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="join-key-eq">=</span>
              <select className="join-select-sm" value={pair.colB}
                onChange={(e) => updateKey(i, 'colB', e.target.value)}>
                {tableB.columns.filter((c) => c !== linkB?.column).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button className="join-remove-key" onClick={() => removeKey(i)}>×</button>
            </div>
          ))}

          <div className="join-shared-hints">
            {shared.slice(0, 6).map((col) => (
              <button key={col} className="join-shared-chip" onClick={() => addKey(col, col)}
                title={`Also match on "${col}" in both tables`}>
                + {col}
              </button>
            ))}
            <button className="join-add-custom"
              onClick={() => addKey(tableA.columns[0], tableB.columns[0])}>
              + Custom pair
            </button>
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {result && tableAId !== tableBId && (
        <>
          <div className="join-result-bar">
            <span className="join-result-info">
              {result.matchedKeys} matched keys · {result.rows.length} rows
              {result.rows.length > MAX_JOIN_ROWS && ` (showing first ${MAX_JOIN_ROWS})`}
            </span>
            {result.warning && <span className="join-result-warning">{result.warning}</span>}
            {result.rows.length > 0 && (
              <button className="btn-csv"
                onClick={() => downloadCSV(result.columns, result.rows, joinName)}>
                ⬇ Download CSV
              </button>
            )}
          </div>

          {result.rows.length === 0 ? (
            <div className="join-empty">{result.warning || 'No rows matched.'}</div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {result.columns.map((col) => (
                      <th key={col} title={col}
                        className={keyCols.includes(col) ? 'join-key-col' : ''}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => (
                    <tr key={i}>
                      {result.columns.map((col) => {
                        const val = row[col]
                        const isNull = val == null || val === ''
                        return (
                          <td key={col}
                            className={`${isNull ? 'null-cell' : ''} ${keyCols.includes(col) ? 'join-key-col' : ''}`}
                            title={isNull ? '' : String(val)}>
                            {isNull ? '—' : String(val)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
