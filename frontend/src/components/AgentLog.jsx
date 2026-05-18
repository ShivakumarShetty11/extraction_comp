import { useState } from 'react'

const STEP_META = {
  thought:      { icon: '🤔', label: 'Thought',      cls: 'step-thought' },
  tool_result:  { icon: '🔧', label: 'Tool Result',   cls: 'step-tool' },
  final_answer: { icon: '✅', label: 'Final Answer',  cls: 'step-final' },
  fallback:     { icon: '⚠️', label: 'Fallback',      cls: 'step-fallback' },
}

function JsonBlock({ value }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const [expanded, setExpanded] = useState(false)
  const lines = text.split('\n')
  const preview = lines.slice(0, 6).join('\n')
  const hasMore = lines.length > 6

  return (
    <div className="json-block">
      <pre>{expanded || !hasMore ? text : preview + '\n…'}</pre>
      {hasMore && (
        <button className="json-toggle" onClick={() => setExpanded(e => !e)}>
          {expanded ? '▲ collapse' : `▼ show all (${lines.length} lines)`}
        </button>
      )}
    </div>
  )
}

function Step({ step, index }) {
  const [open, setOpen] = useState(index === 0)
  const meta = STEP_META[step.type] ?? { icon: '•', label: step.type, cls: 'step-thought' }

  // Build a short summary for the collapsed header
  let summary = ''
  if (step.type === 'thought') {
    if (step.tool_calls?.length) {
      summary = `Calling: ${step.tool_calls.map(tc => tc.tool).join(', ')}`
    } else {
      const text = step.content || ''
      summary = text.slice(0, 90) + (text.length > 90 ? '…' : '')
      if (!summary) summary = '(no reasoning text returned by model)'
    }
  } else if (step.type === 'tool_result') {
    summary = step.tool
  } else if (step.type === 'final_answer') {
    const ans = step.content
    summary = ans ? `header_rows=${ans.header_rows ?? '?'}, skip_rows=[${(ans.skip_rows ?? []).join(',')}], cols=${ans.columns?.length ?? '?'}` : ''
  } else {
    summary = step.content?.slice?.(0, 90) ?? ''
  }

  return (
    <div className={`agent-step ${meta.cls}`}>
      <button className="step-header" onClick={() => setOpen(o => !o)}>
        <span className="step-icon">{meta.icon}</span>
        <span className="step-num">Step {index + 1}</span>
        <span className="step-label">{meta.label}</span>
        {summary && <span className="step-summary">{summary}</span>}
        <span className="step-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="step-body">
          {/* Thought text */}
          {step.type === 'thought' && step.content && (
            <div className="step-section">
              <div className="step-section-label">Agent reasoning</div>
              <div className="step-text">{step.content}</div>
            </div>
          )}

          {/* Tool calls announced in a thought step */}
          {step.tool_calls?.map((tc, i) => (
            <div key={i} className="step-section">
              <div className="step-section-label">Calling tool: <code>{tc.tool}</code></div>
              <JsonBlock value={tc.input_raw} />
            </div>
          ))}

          {/* Tool result step */}
          {step.type === 'tool_result' && (
            <>
              <div className="step-section">
                <div className="step-section-label">Tool: <code>{step.tool}</code></div>
                <div className="step-section-label" style={{ marginTop: 6 }}>Input</div>
                <JsonBlock value={step.input} />
              </div>
              <div className="step-section">
                <div className="step-section-label">Output</div>
                <JsonBlock value={step.output} />
              </div>
            </>
          )}

          {/* Final answer */}
          {step.type === 'final_answer' && step.content && (
            <div className="step-section">
              <div className="step-section-label">Extracted structure</div>
              <JsonBlock value={step.content} />
            </div>
          )}

          {/* Fallback */}
          {step.type === 'fallback' && (
            <div className="step-section">
              <div className="step-text step-warn">{step.content}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AgentLog({ steps }) {
  const [collapsed, setCollapsed] = useState(false)

  // Always render the panel in agent mode — show "no steps" if empty
  if (!steps) return null

  const toolCallCount = steps.filter(s => s.type === 'tool_result').length
  const finalAnswer   = steps.find(s => s.type === 'final_answer')

  return (
    <div className="agent-log">
      <button className="agent-log-header" onClick={() => setCollapsed(c => !c)}>
        <span className="agent-log-icon">🤖</span>
        <span className="agent-log-title">Agent Reasoning Chain</span>
        <span className="agent-log-stats">
          {steps.length} steps · {toolCallCount} tool call{toolCallCount !== 1 ? 's' : ''}
          {finalAnswer ? ' · ✅ resolved' : ''}
        </span>
        <span className="agent-log-chevron">{collapsed ? '▼ expand' : '▲ collapse'}</span>
      </button>

      {!collapsed && (
        <div className="agent-log-body">
          <div className="agent-log-legend">
            <span className="legend-item"><span className="step-icon">🤔</span> Thought</span>
            <span className="legend-item"><span className="step-icon">🔧</span> Tool result</span>
            <span className="legend-item"><span className="step-icon">✅</span> Final answer</span>
          </div>
          {steps.length === 0
            ? <div className="step-text step-warn" style={{padding:'10px'}}>No steps were recorded for this table.</div>
            : steps.map((step, i) => <Step key={i} step={step} index={i} />)
          }
        </div>
      )}
    </div>
  )
}
