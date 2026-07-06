import { useState, useEffect } from 'react'

const FREQUENCY_OPTIONS = ['Annual', 'Monthly', 'Quarterly', 'Decennial', 'Ad-hoc']

export default function PushModal({ tables, groups, onClose }) {
  const [existingGroups, setExistingGroups] = useState([])
  const [scope, setScope] = useState('all')
  const [metaMode, setMetaMode] = useState('new')
  const [selectedMetaId, setSelectedMetaId] = useState('')
  const [form, setForm] = useState({
    title: '',
    description: '',
    product: '',
    category: '',
    geography: '',
    frequency: '',
    time_period: '',
    data_source: '',
    future_release: '',
    key_statistics: '',
    remarks: '',
  })
  const [excelFile, setExcelFile] = useState(null)
  const [step, setStep] = useState('config')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/catalogue/groups')
      .then((r) => r.json())
      .then((data) => {
        const grps = data.groups || []
        setExistingGroups(grps)
        if (grps.length > 0) setSelectedMetaId(grps[0].metadata_id)
      })
      .catch(() => {})
  }, [])

  const tablesToPush = (() => {
    if (scope === 'all') return tables
    const grp = groups && groups.find((g) => g.name === scope)
    if (!grp) return []
    return tables.filter((t) => grp.table_ids.includes(t.id))
  })()

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handlePush = async () => {
    setStep('pushing')
    setError('')
    try {
      const fd = new FormData()
      fd.append('tables_json', JSON.stringify(tablesToPush))
      fd.append('metadata_mode', metaMode)
      if (metaMode === 'existing') {
        fd.append('metadata_id', selectedMetaId)
      }
      fd.append('meta_title', form.title || '')
      fd.append('meta_description', form.description || '')
      fd.append('meta_product', form.product || '')
      fd.append('meta_category', form.category || '')
      fd.append('meta_geography', form.geography || '')
      fd.append('meta_frequency', form.frequency || '')
      fd.append('meta_time_period', form.time_period || '')
      fd.append('meta_data_source', form.data_source || '')
      fd.append('meta_future_release', form.future_release || '')
      fd.append('meta_key_statistics', form.key_statistics || '')
      fd.append('meta_remarks', form.remarks || '')
      if (excelFile) {
        fd.append('meta_excel', excelFile)
      }

      const res = await fetch('/api/catalogue/push', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(err.detail || 'Push failed')
      }
      const data = await res.json()
      setResult(data)
      setStep('done')
    } catch (e) {
      setError(e.message)
      setStep('error')
    }
  }

  const pushDisabled =
    step === 'pushing' || (metaMode === 'new' && !form.title.trim())

  return (
    <div className="push-overlay">
      <div className="push-modal">
        <div className="push-modal-header">
          <span className="push-modal-title">Push to Data Catalogue</span>
          <button className="push-close" onClick={onClose}>✕</button>
        </div>

        {step === 'done' && result && (
          <div className="push-success">
            <div className="push-success-icon">✓</div>
            <div className="push-success-msg">{result.tables_pushed} tables pushed successfully</div>
            <div className="push-success-detail">Metadata ID: {result.metadata_id}</div>
            <button className="push-btn" onClick={onClose}>Done</button>
          </div>
        )}

        {step === 'error' && (
          <div className="push-error-state">
            <div className="push-error-msg">{error}</div>
            <button className="push-btn-secondary" onClick={() => setStep('config')}>Try Again</button>
          </div>
        )}

        {(step === 'config' || step === 'pushing') && (
          <>
            <div className="push-modal-body">
              {/* Section 1: scope */}
              <div className="push-section">
                <div className="push-section-title">Tables to push</div>
                <div className="push-radio-group">
                  <label className="push-radio">
                    <input
                      type="radio"
                      name="scope"
                      value="all"
                      checked={scope === 'all'}
                      onChange={() => setScope('all')}
                    />
                    All tables ({tables.length})
                  </label>
                  {groups && groups.map((g) => (
                    <label key={g.name} className="push-radio">
                      <input
                        type="radio"
                        name="scope"
                        value={g.name}
                        checked={scope === g.name}
                        onChange={() => setScope(g.name)}
                      />
                      Group: {g.name} ({g.table_ids.length})
                    </label>
                  ))}
                </div>
                <div className="push-scope-count">{tablesToPush.length} tables selected</div>
              </div>

              {/* Section 2: metadata group */}
              <div className="push-section">
                <div className="push-section-title">Metadata Group</div>
                <div className="push-radio-group">
                  <label className="push-radio">
                    <input
                      type="radio"
                      name="metaMode"
                      value="new"
                      checked={metaMode === 'new'}
                      onChange={() => setMetaMode('new')}
                    />
                    Create new group
                  </label>
                  {existingGroups.length > 0 && (
                    <label className="push-radio">
                      <input
                        type="radio"
                        name="metaMode"
                        value="existing"
                        checked={metaMode === 'existing'}
                        onChange={() => setMetaMode('existing')}
                      />
                      Add to existing group
                    </label>
                  )}
                </div>

                {metaMode === 'existing' ? (
                  <div className="push-field">
                    <label className="push-label">Select group</label>
                    <select
                      className="push-input"
                      value={selectedMetaId}
                      onChange={(e) => setSelectedMetaId(e.target.value)}
                    >
                      {existingGroups.map((g) => (
                        <option key={g.metadata_id} value={g.metadata_id}>
                          {g.title} ({g.table_count ?? 0} datasets)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="push-new-form">
                    <div className="push-field">
                      <label className="push-label">Title *</label>
                      <input
                        className="push-input"
                        type="text"
                        value={form.title}
                        onChange={(e) => handleFormChange('title', e.target.value)}
                        placeholder="e.g. Population Statistics 2024"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Description</label>
                      <textarea
                        className="push-input push-textarea"
                        value={form.description}
                        onChange={(e) => handleFormChange('description', e.target.value)}
                        placeholder="Brief description of this dataset group"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Product</label>
                      <input
                        className="push-input"
                        type="text"
                        value={form.product}
                        onChange={(e) => handleFormChange('product', e.target.value)}
                        placeholder="e.g. Population_Data"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Category</label>
                      <input
                        className="push-input"
                        type="text"
                        value={form.category}
                        onChange={(e) => handleFormChange('category', e.target.value)}
                        placeholder="e.g. Demographics"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Geography</label>
                      <input
                        className="push-input"
                        type="text"
                        value={form.geography}
                        onChange={(e) => handleFormChange('geography', e.target.value)}
                        placeholder="e.g. India"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Frequency</label>
                      <select
                        className="push-input"
                        value={form.frequency}
                        onChange={(e) => handleFormChange('frequency', e.target.value)}
                      >
                        <option value="">— select —</option>
                        {FREQUENCY_OPTIONS.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div className="push-field">
                      <label className="push-label">Time Period</label>
                      <input
                        className="push-input"
                        type="text"
                        value={form.time_period}
                        onChange={(e) => handleFormChange('time_period', e.target.value)}
                        placeholder="e.g. 2001–2021"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Data Source</label>
                      <input
                        className="push-input"
                        type="text"
                        value={form.data_source}
                        onChange={(e) => handleFormChange('data_source', e.target.value)}
                        placeholder="e.g. Census of India"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Future Release</label>
                      <input
                        className="push-input"
                        type="text"
                        value={form.future_release}
                        onChange={(e) => handleFormChange('future_release', e.target.value)}
                        placeholder="e.g. July, 2026"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Key Statistics</label>
                      <textarea
                        className="push-input push-textarea"
                        value={form.key_statistics}
                        onChange={(e) => handleFormChange('key_statistics', e.target.value)}
                        placeholder="Brief summary of key statistics in this dataset"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Remarks</label>
                      <textarea
                        className="push-input push-textarea"
                        value={form.remarks}
                        onChange={(e) => handleFormChange('remarks', e.target.value)}
                        placeholder="Any additional notes or caveats"
                      />
                    </div>
                    <div className="push-field">
                      <label className="push-label">Source Excel (optional)</label>
                      <input
                        className="push-input push-file-input"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => setExcelFile(e.target.files[0] || null)}
                      />
                      {excelFile && (
                        <div className="push-file-name">{excelFile.name}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="push-modal-footer">
              <button className="push-btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="push-btn"
                onClick={handlePush}
                disabled={pushDisabled}
              >
                {step === 'pushing' ? 'Pushing…' : `Push ${tablesToPush.length} tables →`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
