'use client'
import { useState } from 'react'

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

export default function WhatsAppPage() {
  // Session status
  const [status, setStatus]         = useState<StatusResult | null>(null)
  const [checking, setChecking]     = useState(false)

  // Test send
  const [testPhone, setTestPhone]   = useState('')
  const [testMessage, setTestMessage] = useState('Hi! This is a test message from FMB Portal.')
  const [sending, setSending]       = useState(false)

  // Toast
  const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'danger' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'danger' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const checkStatus = async () => {
    setChecking(true)
    setStatus(null)
    try {
      const res = await fetch('/api/notifications/whatsapp/session/status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ is_connected: false, state: 'UNREACHABLE', error: 'Network error' })
    }
    setChecking(false)
  }

  const sendTestMessage = async () => {
    if (!testPhone.trim()) { showToast('Enter a phone number', 'danger'); return }
    if (!testMessage.trim()) { showToast('Enter a message', 'danger'); return }
    setSending(true)
    try {
      const res = await fetch('/api/notifications/whatsapp/session/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error ?? 'Send failed', 'danger')
      } else {
        showToast('Message sent successfully!')
      }
    } catch {
      showToast('Network error', 'danger')
    }
    setSending(false)
  }

  const stateColor = (state: SessionState) => {
    if (state === 'WORKING')    return '#0ab39c'
    if (state === 'STOPPED')    return '#f06548'
    if (state === 'UNREACHABLE') return '#f7b84b'
    return '#878a99'
  }

  const stateIcon = (state: SessionState) => {
    if (state === 'WORKING')    return 'bi-check-circle-fill'
    if (state === 'STOPPED')    return 'bi-x-circle-fill'
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
      <div style={{ marginBottom: 28 }}>
        <h5 className="fw-bold mb-1" style={{ color: 'var(--bs-body-color)' }}>
          <i className="bi bi-whatsapp me-2" style={{ color: '#25D366' }} />
          WhatsApp
        </h5>
        <p className="mb-0" style={{ fontSize: 13, color: 'var(--bs-secondary-color)' }}>
          Configure WAHA session and send test messages before setting up campaigns.
        </p>
      </div>

      {/* Session Status Card */}
      <div style={{ background: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h6 className="fw-bold mb-0" style={{ color: 'var(--bs-body-color)', fontSize: 14 }}>
            <i className="bi bi-plug-fill me-2" style={{ color: '#364574' }} />
            Session Status
          </h6>
          <button
            onClick={checkStatus}
            disabled={checking}
            className="btn btn-sm"
            style={{ background: '#364574', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
          >
            {checking
              ? <><span className="spinner-border spinner-border-sm me-2" />Checking...</>
              : <><i className="bi bi-arrow-clockwise me-1" />Check Status</>
            }
          </button>
        </div>

        {!status && !checking && (
          <p style={{ fontSize: 13, color: 'var(--bs-secondary-color)', margin: 0 }}>
            Click "Check Status" to ping your WAHA instance.
          </p>
        )}

        {status && (
          <div>
            {/* Connection badge */}
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

            {/* Config details */}
            {status.config && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Session', value: status.config.session_name },
                  { label: 'Mode', value: status.config.mode.toUpperCase() },
                  { label: 'Phone', value: status.config.phone_number ?? '—' },
                  { label: 'Active', value: status.config.is_active ? 'Yes' : 'No' },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: 'var(--bs-tertiary-bg)',
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bs-body-color)' }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {status.error && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#f06548' }}>
                <i className="bi bi-exclamation-triangle me-1" />
                {status.error}
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
          <input
            type="text"
            className="form-control"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="923001234567 (no + or spaces)"
            style={{ borderRadius: 8, fontSize: 13 }}
          />
          <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', marginTop: 4 }}>
            Country code required. Example: 923001234567
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--bs-secondary-color)', display: 'block', marginBottom: 6 }}>
            Message
          </label>
          <textarea
            className="form-control"
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            rows={3}
            style={{ borderRadius: 8, fontSize: 13, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={sendTestMessage}
            disabled={sending}
            className="btn btn-sm"
            style={{ background: '#25D366', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
          >
            {sending
              ? <><span className="spinner-border spinner-border-sm me-2" />Sending...</>
              : <><i className="bi bi-send me-1" />Send</>
            }
          </button>
          <span style={{ fontSize: 12, color: 'var(--bs-secondary-color)' }}>
            Session must be connected before sending.
          </span>
        </div>
      </div>
    </div>
  )
}
