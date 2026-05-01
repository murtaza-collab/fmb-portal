'use client'
import { useState, useEffect, useRef } from 'react'

type SessionState = 'WORKING' | 'STOPPED' | 'UNKNOWN' | 'UNREACHABLE' | null

type Config = {
  session_name: string
  phone_number: string | null
  mode: 'testing' | 'production'
  is_active: boolean
}

type StatusResult = {
  is_connected: boolean
  state: SessionState
  config?: Config
  error?: string
}

type WaTemplate = { id: number; title: string; body: string; variables: string[] }

const VARIABLES = [
  { key: 'mumin_name',       label: 'Mumin Name',       available: true  },
  { key: 'sf_no',            label: 'SF Number',         available: true  },
  { key: 'takhmeen_amount',  label: 'Takhmeen Amount',   available: false },
  { key: 'due_date',         label: 'Due Date',          available: false },
  { key: 'sector_name',      label: 'Sector Name',       available: false },
]

export default function WhatsAppPage() {
  const [tab, setTab] = useState<'session' | 'qr' | 'templates'>('session')

  // Session status
  const [status, setStatus]     = useState<StatusResult | null>(null)
  const [checking, setChecking] = useState(false)

  // Test send
  const [testPhone, setTestPhone]     = useState('')
  const [testMessage, setTestMessage] = useState('Hi! This is a test message from FMB Portal.')
  const [sending, setSending]         = useState(false)

  // QR
  const [qrUrl, setQrUrl]         = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError]     = useState<string | null>(null)
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  // Templates
  const [templates, setTemplates]   = useState<WaTemplate[]>([])
  const [tplTitle, setTplTitle]     = useState('')
  const [tplBody, setTplBody]       = useState('')
  const [savingTpl, setSavingTpl]   = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const bodyRef                     = useRef<HTMLTextAreaElement>(null)

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'danger' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Auto-refresh QR when on QR tab
  useEffect(() => {
    if (tab === 'qr') {
      fetchQr()
      intervalRef.current = setInterval(fetchQr, 15000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [tab])

  // Load templates when on templates tab
  useEffect(() => {
    if (tab === 'templates') fetchTemplates()
  }, [tab])

  const fetchTemplates = async () => {
    const res = await fetch('/api/notifications/whatsapp/templates')
    const data = await res.json()
    if (data.templates) setTemplates(data.templates)
  }

  const insertVariable = (key: string) => {
    const ta = bodyRef.current
    if (!ta) { setTplBody(prev => prev + `{{${key}}}`); return }
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const newVal = tplBody.slice(0, start) + `{{${key}}}` + tplBody.slice(end)
    setTplBody(newVal)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + key.length + 4, start + key.length + 4) }, 0)
  }

  const saveTemplate = async () => {
    if (!tplTitle.trim() || !tplBody.trim()) { showToast('Title and body required', 'danger'); return }
    setSavingTpl(true)
    const res  = await fetch('/api/notifications/whatsapp/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: tplTitle, body: tplBody }),
    })
    const data = await res.json()
    if (!res.ok) { showToast(data.error ?? 'Save failed', 'danger') }
    else {
      showToast('Template saved')
      setTplTitle(''); setTplBody('')
      fetchTemplates()
    }
    setSavingTpl(false)
  }

  const deleteTemplate = async (id: number) => {
    setDeletingId(id)
    const res = await fetch('/api/notifications/whatsapp/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) { showToast('Template deleted'); fetchTemplates() }
    else showToast('Delete failed', 'danger')
    setDeletingId(null)
  }

  const fetchQr = async () => {
    setQrLoading(true)
    setQrError(null)
    try {
      const res = await fetch('/api/notifications/whatsapp/session/qr')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setQrError(data.error ?? `Error ${res.status}`)
        setQrUrl(null)
      } else {
        const blob = await res.blob()
        const url  = URL.createObjectURL(blob)
        setQrUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
      }
    } catch {
      setQrError('Could not reach WAHA')
    }
    setQrLoading(false)
  }

  const checkStatus = async () => {
    setChecking(true)
    setStatus(null)
    try {
      const res  = await fetch('/api/notifications/whatsapp/session/status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ is_connected: false, state: 'UNREACHABLE', error: 'Network error' })
    }
    setChecking(false)
  }

  const sendTestMessage = async () => {
    if (!testPhone.trim())   { showToast('Enter a phone number', 'danger'); return }
    if (!testMessage.trim()) { showToast('Enter a message', 'danger'); return }
    setSending(true)
    try {
      const res  = await fetch('/api/notifications/whatsapp/session/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage.trim() }),
      })
      const data = await res.json()
      if (!res.ok) showToast(data.error ?? 'Send failed', 'danger')
      else         showToast('Message sent successfully!')
    } catch {
      showToast('Network error', 'danger')
    }
    setSending(false)
  }

  const stateColor = (state: SessionState) => {
    if (state === 'WORKING')     return '#0ab39c'
    if (state === 'STOPPED')     return '#f06548'
    if (state === 'UNREACHABLE') return '#f7b84b'
    return '#878a99'
  }

  const stateIcon = (state: SessionState) => {
    if (state === 'WORKING')     return 'bi-check-circle-fill'
    if (state === 'STOPPED')     return 'bi-x-circle-fill'
    if (state === 'UNREACHABLE') return 'bi-exclamation-triangle-fill'
    return 'bi-question-circle-fill'
  }

  return (
    <div style={{ padding: '24px 0', maxWidth: 640 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'success' ? '#0ab39c' : '#f06548',
          color: '#fff', borderRadius: 10, padding: '10px 18px',
          fontWeight: 600, fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          <i className={`bi ${toast.type === 'success' ? 'bi-check-circle' : 'bi-x-circle'} me-2`} />
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h5 className="fw-bold mb-1" style={{ color: 'var(--bs-body-color)' }}>
          <i className="bi bi-whatsapp me-2" style={{ color: '#25D366' }} />
          WhatsApp
        </h5>
        <p className="mb-0" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>
          Configure WAHA session and send messages to mumineen.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-4" style={{ borderBottom: '1px solid var(--bs-border-color)' }}>
        {([
          { key: 'session',   label: 'Session',    icon: 'bi-plug-fill'    },
          { key: 'qr',        label: 'Connect QR', icon: 'bi-qr-code'      },
          { key: 'templates', label: 'Templates',  icon: 'bi-file-text-fill' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', padding: '8px 18px 10px', fontSize: 13,
            fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer',
            color: tab === t.key ? '#364574' : 'var(--bs-secondary-color)',
            borderBottom: tab === t.key ? '2px solid #364574' : '2px solid transparent',
            marginBottom: '-1px', transition: 'all 0.15s',
          }}>
            <i className={`bi ${t.icon} me-2`} style={{ color: tab === t.key ? '#ffbf69' : 'inherit' }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Session Tab ── */}
      {tab === 'session' && (
        <>
          {/* Status Card */}
          <div style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h6 className="fw-bold mb-0" style={{ color: 'var(--bs-body-color)', fontSize: 14 }}>Session Status</h6>
              <button onClick={checkStatus} disabled={checking} className="btn btn-sm"
                style={{ background: '#364574', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                {checking
                  ? <><span className="spinner-border spinner-border-sm me-2" />Checking...</>
                  : <><i className="bi bi-arrow-clockwise me-1" />Check Status</>}
              </button>
            </div>

            {!status && !checking && (
              <p style={{ fontSize: 13, color: 'var(--bs-secondary-color)', margin: 0 }}>
                Click "Check Status" to ping your WAHA instance.
              </p>
            )}

            {status && (
              <div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: status.is_connected ? 'rgba(10,179,156,0.12)' : 'rgba(240,101,72,0.12)',
                  border: `1px solid ${status.is_connected ? '#0ab39c' : '#f06548'}`,
                  borderRadius: 20, padding: '6px 14px', marginBottom: 16,
                }}>
                  <i className={`bi ${stateIcon(status.state)}`} style={{ color: stateColor(status.state), fontSize: 15 }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: stateColor(status.state) }}>
                    {status.state ?? 'UNKNOWN'}
                  </span>
                  {status.is_connected && (
                    <span style={{ fontSize: 12, color: '#0ab39c' }}>— Connected</span>
                  )}
                </div>

                {status.config && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Session', value: status.config.session_name },
                      { label: 'Mode',    value: status.config.mode.toUpperCase() },
                      { label: 'Phone',   value: status.config.phone_number ?? '—' },
                      { label: 'Active',  value: status.config.is_active ? 'Yes' : 'No' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: 'var(--bs-tertiary-bg)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bs-body-color)' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {status.error && (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#f06548' }}>
                    <i className="bi bi-exclamation-triangle me-1" />{status.error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Test Send Card */}
          <div style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12, padding: 20 }}>
            <h6 className="fw-bold mb-3" style={{ color: 'var(--bs-body-color)', fontSize: 14 }}>
              <i className="bi bi-send-fill me-2" style={{ color: '#25D366' }} />
              Send Test Message
            </h6>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--bs-secondary-color)', display: 'block', marginBottom: 6 }}>
                Phone Number
              </label>
              <input type="text" className="form-control" value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="923001234567 (no + or spaces)"
                style={{ borderRadius: 8, fontSize: 13 }} />
              <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', marginTop: 4 }}>
                Country code required. Example: 923001234567
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--bs-secondary-color)', display: 'block', marginBottom: 6 }}>
                Message
              </label>
              <textarea className="form-control" value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                rows={3} style={{ borderRadius: 8, fontSize: 13, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={sendTestMessage} disabled={sending} className="btn btn-sm"
                style={{ background: '#25D366', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                {sending
                  ? <><span className="spinner-border spinner-border-sm me-2" />Sending...</>
                  : <><i className="bi bi-send me-1" />Send</>}
              </button>
              <span style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>
                Session must be connected before sending.
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── QR Tab ── */}
      {tab === 'qr' && (
        <div style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h6 className="fw-bold mb-1" style={{ color: 'var(--bs-body-color)', fontSize: 14 }}>
                Scan to Connect WhatsApp
              </h6>
              <p className="mb-0" style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>
                Auto-refreshes every 15 seconds. QR expires in ~20s — scan quickly.
              </p>
            </div>
            <button onClick={fetchQr} disabled={qrLoading} className="btn btn-sm btn-outline-secondary"
              style={{ borderRadius: 8, fontSize: 12 }}>
              <i className="bi bi-arrow-clockwise me-1" />Refresh
            </button>
          </div>

          {/* QR Image */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#fff', borderRadius: 12, padding: 24, minHeight: 360,
            border: '1px solid var(--bs-border-color)',
          }}>
            {qrLoading && !qrUrl && (
              <div className="text-center">
                <div className="spinner-border" style={{ color: '#364574', width: '2rem', height: '2rem' }} />
                <div style={{ fontSize: 13, color: '#888', marginTop: 12 }}>Loading QR...</div>
              </div>
            )}
            {qrError && (
              <div className="text-center">
                <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 32, color: '#f7b84b' }} />
                <div style={{ fontSize: 13, color: '#f06548', marginTop: 8 }}>{qrError}</div>
                <button onClick={fetchQr} className="btn btn-sm btn-outline-secondary mt-3" style={{ borderRadius: 8, fontSize: 12 }}>
                  Try Again
                </button>
              </div>
            )}
            {qrUrl && !qrError && (
              <img src={qrUrl} alt="WhatsApp QR Code"
                style={{ width: 320, height: 320, objectFit: 'contain', imageRendering: 'pixelated' }} />
            )}
          </div>

          <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(37,211,102,0.08)', borderRadius: 8, border: '1px solid rgba(37,211,102,0.2)' }}>
            <p className="mb-0" style={{ fontSize: 12, color: 'var(--bs-body-color)' }}>
              <strong>How to connect:</strong> Open WhatsApp on your phone →
              <strong> Settings</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong> → scan this QR.
            </p>
          </div>
        </div>
      )}

      {/* ── Templates Tab ── */}
      {tab === 'templates' && (
        <div>
          {/* New Template */}
          <div style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h6 className="fw-bold mb-3" style={{ color: 'var(--bs-body-color)', fontSize: 14 }}>
              <i className="bi bi-plus-circle-fill me-2" style={{ color: '#364574' }} />
              New Template
            </h6>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--bs-secondary-color)', display: 'block', marginBottom: 6 }}>Title</label>
              <input type="text" className="form-control" value={tplTitle}
                onChange={e => setTplTitle(e.target.value)}
                placeholder="e.g. Payment Reminder"
                style={{ borderRadius: 8, fontSize: 13 }} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--bs-secondary-color)', display: 'block', marginBottom: 6 }}>Message Body</label>
              <textarea ref={bodyRef} className="form-control" value={tplBody}
                onChange={e => setTplBody(e.target.value)}
                rows={4} placeholder="e.g. Assalamualaikum {{mumin_name}}, this is a reminder from FMB."
                style={{ borderRadius: 8, fontSize: 13, resize: 'vertical' }} />
            </div>

            {/* Variable Picker */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', marginBottom: 6 }}>Insert variable at cursor:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {VARIABLES.map(v => (
                  <button key={v.key} onClick={() => v.available && insertVariable(v.key)}
                    disabled={!v.available}
                    style={{
                      border: '1px solid',
                      borderColor: v.available ? '#364574' : 'var(--bs-border-color)',
                      background: v.available ? 'rgba(54,69,116,0.08)' : 'var(--bs-tertiary-bg)',
                      color: v.available ? '#364574' : 'var(--bs-secondary-color)',
                      borderRadius: 16, padding: '3px 10px', fontSize: 12, cursor: v.available ? 'pointer' : 'not-allowed',
                    }}>
                    {`{{${v.key}}}`}
                    {!v.available && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>soon</span>}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={saveTemplate} disabled={savingTpl} className="btn btn-sm"
              style={{ background: '#364574', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
              {savingTpl
                ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</>
                : <><i className="bi bi-check-lg me-1" />Save Template</>}
            </button>
          </div>

          {/* Saved Templates */}
          {templates.length > 0 && (
            <div style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bs-border-color)' }}>
                <h6 className="fw-bold mb-0" style={{ color: 'var(--bs-body-color)', fontSize: 14 }}>
                  Saved Templates ({templates.length})
                </h6>
              </div>
              {templates.map((t, i) => (
                <div key={t.id} style={{
                  padding: '14px 20px',
                  borderBottom: i < templates.length - 1 ? '1px solid var(--bs-border-color)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--bs-body-color)', marginBottom: 4 }}>{t.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--bs-secondary-color)', whiteSpace: 'pre-wrap' }}>{t.body}</div>
                      {t.variables?.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {t.variables.map(v => (
                            <span key={v} style={{ fontSize: 11, background: 'rgba(54,69,116,0.1)', color: '#364574', borderRadius: 10, padding: '2px 8px' }}>
                              {`{{${v}}}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteTemplate(t.id)} disabled={deletingId === t.id}
                      style={{ background: 'none', border: 'none', color: '#f06548', cursor: 'pointer', fontSize: 16, padding: 4 }}>
                      {deletingId === t.id
                        ? <span className="spinner-border spinner-border-sm" />
                        : <i className="bi bi-trash3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {templates.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--bs-secondary-color)', fontSize: 13 }}>
              No templates yet. Create one above.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
