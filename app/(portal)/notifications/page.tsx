'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Template = {
  id: number; event_type: string; label: string
  title: string; body: string; enabled: boolean
}
type Log = {
  id: number; title: string; body: string; segment: string
  sent_count: number; failed_count?: number; sent_at: string; event_type: string
}
type NiyyatStatus = { id: number; name: string }
type Segment = { key: string; label: string; description: string; icon: string; niyyat_status_id?: number }

const EVENT_ICONS: Record<string, string> = {
  stop_request_approved:   'bi-check-circle-fill',
  stop_request_rejected:   'bi-x-circle-fill',
  address_change_approved: 'bi-geo-alt-fill',
  address_change_rejected: 'bi-geo-alt',
  niyyat_approved:         'bi-patch-check-fill',
  welcome:                 'bi-hand-wave-fill',
}
const EVENT_COLORS: Record<string, string> = {
  stop_request_approved:   '#0ab39c',
  stop_request_rejected:   '#f06548',
  address_change_approved: '#299cdb',
  address_change_rejected: '#f7b84b',
  niyyat_approved:         '#364574',
  welcome:                 '#ffbf69',
}
const NIYYAT_ICONS: Record<string, string> = {
  'Approved':         'bi-check-circle-fill',
  'Niyyat Pending':   'bi-hourglass-split',
  'No-Show':          'bi-x-circle-fill',
  'Verified':         'bi-patch-check-fill',
  'Not Required':     'bi-dash-circle-fill',
  'Pending Approval': 'bi-clock-fill',
}
const NIYYAT_COLORS: Record<string, string> = {
  'Approved':         '#0ab39c',
  'Niyyat Pending':   '#f7b84b',
  'No-Show':          '#f06548',
  'Verified':         '#299cdb',
  'Not Required':     '#878a99',
  'Pending Approval': '#ffbf69',
}

export default function NotificationsPage() {
  const [tab, setTab]               = useState<'automated' | 'broadcast' | 'logs'>('automated')
  const [templates, setTemplates]   = useState<Template[]>([])
  const [logs, setLogs]             = useState<Log[]>([])
  const [niyyatStatuses, setNiyyatStatuses] = useState<NiyyatStatus[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<number | null>(null)
  const [saved, setSaved]           = useState<number | null>(null)
  const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'danger' } | null>(null)
  const [logsOffset, setLogsOffset] = useState(0)
  const [logsMore, setLogsMore]     = useState(true)
  const [logsLoading, setLogsLoading] = useState(false)
  const LOGS_PAGE = 30

  // Broadcast
  const [segment, setSegment]   = useState('all')
  const [bTitle, setBTitle]     = useState('')
  const [bBody, setBBody]       = useState('')
  const [preview, setPreview]   = useState<number | null>(null)
  const [sending, setSending]   = useState(false)

  const showToast = (msg: string, type: 'success' | 'danger' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    Promise.all([
      supabase.from('notification_templates').select('*').order('id'),
      supabase.from('notification_logs').select('*').order('sent_at', { ascending: false }).range(0, LOGS_PAGE - 1),
      supabase.from('niyyat_statuses').select('id, name').order('id'),
    ]).then(([t, l, n]) => {
      if (t.data) setTemplates(t.data)
      if (l.data) {
        setLogs(l.data)
        setLogsMore(l.data.length === LOGS_PAGE)
        setLogsOffset(l.data.length)
      }
      if (n.data) setNiyyatStatuses(n.data)
      setLoading(false)
    })
  }, [])

  const loadMoreLogs = async () => {
    setLogsLoading(true)
    const { data } = await supabase
      .from('notification_logs').select('*')
      .order('sent_at', { ascending: false })
      .range(logsOffset, logsOffset + LOGS_PAGE - 1)
    if (data) {
      setLogs(prev => [...prev, ...data])
      setLogsMore(data.length === LOGS_PAGE)
      setLogsOffset(prev => prev + data.length)
    }
    setLogsLoading(false)
  }

  // Build segments dynamically from niyyat statuses
  const segments: Segment[] = [
    { key: 'all', label: 'All Mumineen', description: 'Every mumin with the app installed', icon: 'bi-people-fill' },
    ...niyyatStatuses.map(s => ({
      key:               `niyyat_${s.id}`,
      label:             s.name,
      description:       `Mumineen with niyyat status: ${s.name}`,
      icon:              NIYYAT_ICONS[s.name] || 'bi-circle-fill',
      niyyat_status_id:  s.id,
    })),
  ]

  const fetchPreview = async (seg: string) => {
    setPreview(null)
    const today = new Date().toISOString().split('T')[0]

    if (seg === 'all') {
      const { count } = await supabase.from('fcm_tokens').select('id', { count: 'exact', head: true })
      setPreview(count ?? 0)
      return
    }

    const segInfo = segments.find(s => s.key === seg)
    if (segInfo?.niyyat_status_id !== undefined) {
      const { data: ids } = await supabase
        .from('mumineen').select('id')
        .eq('niyyat_status_id', segInfo.niyyat_status_id)
      if (!ids?.length) { setPreview(0); return }
      const { count } = await supabase.from('fcm_tokens')
        .select('id', { count: 'exact', head: true })
        .in('mumin_id', ids.map(r => r.id))
      setPreview(count ?? 0)
    }
  }

  useEffect(() => {
    if (!loading) fetchPreview(segment)
  }, [segment, loading])

  const updateTemplate = (id: number, patch: Partial<Template>) =>
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))

  const saveTemplate = async (t: Template) => {
    setSaving(t.id)
    const { error } = await supabase
      .from('notification_templates')
      .update({ title: t.title, body: t.body, enabled: t.enabled, updated_at: new Date().toISOString() })
      .eq('id', t.id)
    setSaving(null)
    if (error) { showToast('Failed to save', 'danger'); return }
    setSaved(t.id)
    showToast('Saved successfully')
    setTimeout(() => setSaved(null), 2000)
  }

  // Toggle enabled and immediately persist — toggle should feel instant
  const toggleTemplate = async (t: Template, enabled: boolean) => {
    updateTemplate(t.id, { enabled })
    setSaving(t.id)
    const { error } = await supabase
      .from('notification_templates')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', t.id)
    setSaving(null)
    if (error) {
      updateTemplate(t.id, { enabled: !enabled }) // revert on failure
      showToast('Failed to update', 'danger')
    }
  }

  const sendBroadcast = async () => {
    if (!bTitle.trim() || !bBody.trim()) { showToast('Title and message required', 'danger'); return }
    setSending(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const segInfo = segments.find(s => s.key === segment)
      let muminIds: number[] | null = null

      if (segInfo?.niyyat_status_id !== undefined) {
        const { data } = await supabase.from('mumineen').select('id')
          .eq('niyyat_status_id', segInfo.niyyat_status_id)
        muminIds = data?.map(r => r.id) || []
      }

      // Fetch FCM tokens
      let tokenQuery = supabase.from('fcm_tokens').select('token')
      if (muminIds !== null) {
        if (!muminIds.length) { showToast('No devices in this segment', 'danger'); setSending(false); return }
        tokenQuery = tokenQuery.in('mumin_id', muminIds)
      }
      const { data: tokenRows } = await tokenQuery
      const tokens = tokenRows?.map(r => r.token) || []
      if (!tokens.length) { showToast('No devices found', 'danger'); setSending(false); return }

      // Call via Next.js API route (avoids CORS)
      const res = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens,
          title: bTitle,
          body: bBody,
          segment: segInfo?.label || segment,
          event_type: 'broadcast',
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Send failed')

      const sentMsg   = `${result.sent ?? 0} sent`
      const failedMsg = result.failed > 0 ? `, ${result.failed} failed` : ''
      showToast(`${sentMsg}${failedMsg}`, result.failed > 0 ? 'danger' : 'success')
      setBTitle(''); setBBody('')

      // Refresh logs
      const { data: newLogs } = await supabase
        .from('notification_logs').select('*').order('sent_at', { ascending: false }).range(0, LOGS_PAGE - 1)
      if (newLogs) {
        setLogs(newLogs)
        setLogsMore(newLogs.length === LOGS_PAGE)
        setLogsOffset(newLogs.length)
      }
      setTab('logs')
    } catch (e: any) {
      showToast(e.message || 'Send failed', 'danger')
    }
    setSending(false)
  }

  const enabledCount = templates.filter(t => t.enabled).length

  return (
    <>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {toast && (
        <div style={{ position:'fixed', top:'76px', right:'24px', zIndex:9999, minWidth:'260px', animation:'fadeIn 0.2s ease' }}>
          <div className={`alert alert-${toast.type} d-flex align-items-center gap-2 shadow mb-0 py-2 px-3`}
            style={{ borderRadius:'10px', fontSize:'13px', border:'none' }}>
            <i className={`bi ${toast.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill'}`} />
            {toast.msg}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h5 className="mb-1 fw-semibold" style={{ color:'var(--bs-body-color)' }}>Push Notifications</h5>
          <p className="mb-0 text-muted" style={{ fontSize:'13px' }}>
            Manage automated alerts and send targeted broadcasts to mumineen.
          </p>
        </div>
        {!loading && (
          <span className="badge rounded-pill d-flex align-items-center gap-1"
            style={{ background:'rgba(54,69,116,0.1)', color:'#364574', fontSize:'12px', padding:'6px 12px' }}>
            <i className="bi bi-bell-fill" style={{ color:'#ffbf69' }} />
            {enabledCount} of {templates.length} automated active
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4" style={{ borderBottom:'1px solid var(--bs-border-color)' }}>
        {(['automated','broadcast','logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background:'none', border:'none', padding:'8px 18px 10px', fontSize:'13px',
            fontWeight: tab===t ? 600 : 400, cursor:'pointer',
            color: tab===t ? '#364574' : 'var(--bs-secondary-color)',
            borderBottom: tab===t ? '2px solid #364574' : '2px solid transparent',
            marginBottom:'-1px', transition:'all 0.15s',
          }}>
            <i className={`bi me-2 ${t==='automated' ? 'bi-lightning-charge-fill' : t==='broadcast' ? 'bi-megaphone-fill' : 'bi-clock-history'}`}
              style={{ color: tab===t ? '#ffbf69' : 'inherit' }} />
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'logs' && logs.length > 0 && (
              <span className="badge rounded-pill ms-2" style={{ background:'rgba(54,69,116,0.15)', color:'#364574', fontSize:'10px' }}>
                {logs.length}{logsMore ? '+' : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" style={{ width:'1.5rem', height:'1.5rem' }} />
        </div>
      )}

      {/* ── Automated Tab ── */}
      {!loading && tab === 'automated' && (
        <>
          <div className="row g-3">
            {templates.map(t => {
              const icon  = EVENT_ICONS[t.event_type]  || 'bi-bell'
              const color = EVENT_COLORS[t.event_type] || '#364574'
              return (
                <div key={t.id} className="col-12 col-xl-6">
                  <div className="card h-100" style={{
                    border:'1px solid var(--bs-border-color)', borderRadius:'12px',
                    boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
                    opacity: t.enabled ? 1 : 0.6, transition:'opacity 0.2s',
                  }}>
                    <div className="card-header d-flex align-items-center justify-content-between"
                      style={{ background:'var(--bs-secondary-bg)', borderBottom:'1px solid var(--bs-border-color)', borderRadius:'12px 12px 0 0', padding:'12px 16px' }}>
                      <div className="d-flex align-items-center gap-3">
                        <div style={{ width:'36px', height:'36px', borderRadius:'10px', flexShrink:0,
                          background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <i className={`bi ${icon}`} style={{ fontSize:'16px', color }} />
                        </div>
                        <div>
                          <div className="fw-semibold" style={{ fontSize:'14px', color:'var(--bs-body-color)' }}>{t.label}</div>
                          <div style={{ fontSize:'11px', color:'var(--bs-secondary-color)', fontFamily:'monospace' }}>{t.event_type}</div>
                        </div>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span style={{ fontSize:'11px', fontWeight:600, color: t.enabled ? '#0ab39c' : 'var(--bs-secondary-color)' }}>
                          {t.enabled ? 'ON' : 'OFF'}
                        </span>
                        <div className="form-check form-switch mb-0">
                          <input className="form-check-input" type="checkbox" role="switch"
                            checked={t.enabled} style={{ cursor:'pointer', width:'40px', height:'20px' }}
                            disabled={saving === t.id}
                            onChange={e => toggleTemplate(t, e.target.checked)} />
                        </div>
                      </div>
                    </div>
                    <div className="card-body" style={{ padding:'16px' }}>
                      <div className="mb-3">
                        <label className="form-label mb-1" style={{ fontSize:'11px', fontWeight:600, color:'var(--bs-secondary-color)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Title</label>
                        <input className="form-control form-control-sm" value={t.title} disabled={saving === t.id}
                          onChange={e => updateTemplate(t.id, { title: e.target.value })}
                          style={{ borderRadius:'8px', fontSize:'13px' }} />
                      </div>
                      <div className="mb-4">
                        <label className="form-label mb-1" style={{ fontSize:'11px', fontWeight:600, color:'var(--bs-secondary-color)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Message</label>
                        <textarea className="form-control form-control-sm" rows={2} value={t.body} disabled={saving === t.id}
                          onChange={e => updateTemplate(t.id, { body: e.target.value })}
                          style={{ borderRadius:'8px', fontSize:'13px', resize:'none' }} />
                      </div>
                      <div className="d-flex align-items-center justify-content-between">
                        <span style={{ fontSize:'11px', color:'var(--bs-secondary-color)' }}>
                          <i className="bi bi-lightning-charge me-1" />Fires automatically on event
                        </span>
                        <button className="btn btn-sm" disabled={saving===t.id} onClick={() => saveTemplate(t)}
                          style={{ background: saved===t.id ? '#0ab39c' : '#364574', color:'#fff',
                            border:'none', borderRadius:'8px', fontSize:'13px', padding:'5px 16px', minWidth:'80px', transition:'all 0.2s' }}>
                          {saving===t.id ? <span className="spinner-border spinner-border-sm" />
                            : saved===t.id ? <><i className="bi bi-check2 me-1" />Saved</>
                            : <><i className="bi bi-floppy me-1" />Save</>}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 p-3 rounded-3 d-flex align-items-start gap-2"
            style={{ background:'rgba(54,69,116,0.06)', border:'1px solid rgba(54,69,116,0.15)' }}>
            <i className="bi bi-info-circle-fill mt-1" style={{ color:'#364574', flexShrink:0 }} />
            <p className="mb-0" style={{ fontSize:'12px', color:'var(--bs-secondary-color)', lineHeight:1.6 }}>
              <strong>Niyyat Approved</strong> fires when a mumin's niyyat status is changed to Approved — covers yearly cycles and month-start.
              <strong> Welcome</strong> fires once on first app login. Toggle <strong>OFF</strong> to suppress any type without touching DB triggers.
            </p>
          </div>
        </>
      )}

      {/* ── Broadcast Tab ── */}
      {!loading && tab === 'broadcast' && (
        <div className="row g-4">
          <div className="col-12 col-lg-7">
            <div className="card" style={{ border:'1px solid var(--bs-border-color)', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              <div className="card-header" style={{ background:'var(--bs-secondary-bg)', borderBottom:'1px solid var(--bs-border-color)', borderRadius:'12px 12px 0 0', padding:'12px 16px' }}>
                <span className="fw-semibold" style={{ fontSize:'14px' }}>
                  <i className="bi bi-megaphone-fill me-2" style={{ color:'#ffbf69' }} />Compose Notification
                </span>
              </div>
              <div className="card-body p-4">
                <label className="form-label fw-semibold mb-2" style={{ fontSize:'13px' }}>Send To</label>
                <div className="d-flex flex-column gap-2 mb-4" style={{ maxHeight:'320px', overflowY:'auto' }}>
                  {segments.map(s => {
                    const color = s.niyyat_status_id !== undefined
                      ? (NIYYAT_COLORS[s.label] || '#364574')
                      : '#364574'
                    return (
                      <label key={s.key} onClick={() => setSegment(s.key)} style={{
                        display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px',
                        borderRadius:'10px', cursor:'pointer', transition:'all 0.15s',
                        border: segment===s.key ? `1.5px solid ${color}` : '1.5px solid var(--bs-border-color)',
                        background: segment===s.key ? `${color}0d` : 'transparent',
                      }}>
                        <div style={{ width:'32px', height:'32px', borderRadius:'8px', flexShrink:0,
                          background: segment===s.key ? `${color}20` : 'var(--bs-secondary-bg)',
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <i className={`bi ${s.icon}`} style={{ color: segment===s.key ? color : 'var(--bs-secondary-color)', fontSize:'14px' }} />
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:'13px', fontWeight:600, color:'var(--bs-body-color)' }}>{s.label}</div>
                          <div style={{ fontSize:'12px', color:'var(--bs-secondary-color)' }}>{s.description}</div>
                        </div>
                        {segment===s.key && preview !== null && (
                          <span className="badge rounded-pill" style={{ background: color, color:'#fff', fontSize:'11px', flexShrink:0 }}>
                            {preview} device{preview !== 1 ? 's' : ''}
                          </span>
                        )}
                        {segment===s.key && preview === null && (
                          <span className="spinner-border spinner-border-sm" style={{ width:'14px', height:'14px', flexShrink:0, color }} />
                        )}
                      </label>
                    )
                  })}
                </div>

                <div className="mb-3">
                  <label className="form-label mb-1" style={{ fontSize:'11px', fontWeight:600, color:'var(--bs-secondary-color)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Title</label>
                  <input className="form-control" value={bTitle} onChange={e => setBTitle(e.target.value)}
                    placeholder="e.g. Takhmeem Reminder" style={{ borderRadius:'8px', fontSize:'13px' }} />
                </div>
                <div className="mb-4">
                  <label className="form-label mb-1" style={{ fontSize:'11px', fontWeight:600, color:'var(--bs-secondary-color)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Message</label>
                  <textarea className="form-control" rows={3} value={bBody} onChange={e => setBBody(e.target.value)}
                    placeholder="e.g. Takhmeem for 1447H is now open. Please complete your niyyat."
                    style={{ borderRadius:'8px', fontSize:'13px', resize:'none' }} />
                </div>

                <button className="btn w-100" disabled={sending || !bTitle.trim() || !bBody.trim()} onClick={sendBroadcast}
                  style={{ background:'#364574', color:'#fff', border:'none', borderRadius:'10px', padding:'10px', fontSize:'14px', fontWeight:600, transition:'all 0.2s' }}>
                  {sending
                    ? <><span className="spinner-border spinner-border-sm me-2" />Sending…</>
                    : <><i className="bi bi-send-fill me-2" />Send to {preview ?? '…'} device{preview !== 1 ? 's' : ''}</>}
                </button>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="col-12 col-lg-5">
            <div className="card" style={{ border:'1px solid var(--bs-border-color)', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              <div className="card-header" style={{ background:'var(--bs-secondary-bg)', borderBottom:'1px solid var(--bs-border-color)', borderRadius:'12px 12px 0 0', padding:'12px 16px' }}>
                <span className="fw-semibold" style={{ fontSize:'14px' }}>
                  <i className="bi bi-phone me-2" style={{ color:'#ffbf69' }} />Live Preview
                </span>
              </div>
              <div className="card-body d-flex flex-column align-items-center justify-content-center p-4" style={{ minHeight:'260px' }}>
                <div style={{ width:'100%', maxWidth:'290px', background:'#1c1c1e', borderRadius:'18px', padding:'14px 16px', boxShadow:'0 8px 32px rgba(0,0,0,0.28)' }}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <div style={{ width:'22px', height:'22px', borderRadius:'6px', background:'#364574', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <i className="bi bi-bell-fill" style={{ fontSize:'10px', color:'#ffbf69' }} />
                    </div>
                    <span style={{ fontSize:'11px', color:'#8e8e93', fontWeight:600, letterSpacing:'0.4px' }}>FMB</span>
                    <span style={{ fontSize:'11px', color:'#8e8e93', marginLeft:'auto' }}>now</span>
                  </div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:'#fff', marginBottom:'4px', lineHeight:1.3 }}>
                    {bTitle || <span style={{ color:'#48484a', fontStyle:'italic' }}>Notification title</span>}
                  </div>
                  <div style={{ fontSize:'12px', color:'rgba(235,235,245,0.75)', lineHeight:1.45 }}>
                    {bBody || <span style={{ color:'#48484a', fontStyle:'italic' }}>Your message will appear here…</span>}
                  </div>
                </div>
                <p className="mt-3 mb-0 text-muted text-center" style={{ fontSize:'11px' }}>
                  Updates as you type
                </p>
              </div>
            </div>

            {/* Device info note */}
            <div className="mt-3 p-3 rounded-3 d-flex align-items-start gap-2"
              style={{ background:'rgba(54,69,116,0.06)', border:'1px solid rgba(54,69,116,0.15)' }}>
              <i className="bi bi-info-circle-fill mt-1" style={{ color:'#364574', flexShrink:0, fontSize:'13px' }} />
              <p className="mb-0" style={{ fontSize:'12px', color:'var(--bs-secondary-color)', lineHeight:1.6 }}>
                Device count = FCM tokens saved. Multiple devices on same account all receive the notification.
                Uninstalled apps are cleaned up automatically on next send.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Logs Tab ── */}
      {!loading && tab === 'logs' && (
        <div className="card" style={{ border:'1px solid var(--bs-border-color)', borderRadius:'12px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div className="card-body p-0">
            {logs.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="bi bi-clock-history" style={{ fontSize:'32px', opacity:0.25 }} />
                <p className="mt-3 mb-0" style={{ fontSize:'13px' }}>No notifications sent yet</p>
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover mb-0" style={{ fontSize:'13px' }}>
                    <thead style={{ background:'var(--bs-secondary-bg)' }}>
                      <tr>
                        {['Title / Message','Segment','Sent','Failed','When'].map(h => (
                          <th key={h} className="px-3 py-3 fw-semibold border-0"
                            style={{ fontSize:'12px', color:'var(--bs-secondary-color)', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(l => (
                        <tr key={l.id}>
                          <td className="px-3 py-3">
                            <div className="fw-semibold" style={{ color:'var(--bs-body-color)', marginBottom:'2px' }}>{l.title}</div>
                            <div style={{ color:'var(--bs-secondary-color)', fontSize:'12px' }}>{l.body}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="badge rounded-pill"
                              style={{ background:'rgba(54,69,116,0.1)', color:'#364574', fontSize:'11px', padding:'4px 10px' }}>
                              {l.segment || l.event_type || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="fw-semibold" style={{ color:'#0ab39c' }}>{l.sent_count}</span>
                          </td>
                          <td className="px-3 py-3">
                            {l.failed_count
                              ? <span className="fw-semibold" style={{ color:'#f06548' }}>{l.failed_count}</span>
                              : <span style={{ color:'var(--bs-secondary-color)' }}>—</span>}
                          </td>
                          <td className="px-3 py-3" style={{ color:'var(--bs-secondary-color)', whiteSpace:'nowrap' }}>
                            {new Date(l.sent_at).toLocaleString('en-PK', { dateStyle:'medium', timeStyle:'short' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {logsMore && (
                  <div className="text-center py-3" style={{ borderTop:'1px solid var(--bs-border-color)' }}>
                    <button className="btn btn-sm btn-outline-secondary" onClick={loadMoreLogs} disabled={logsLoading}
                      style={{ borderRadius:'8px', fontSize:'13px' }}>
                      {logsLoading
                        ? <><span className="spinner-border spinner-border-sm me-1" />Loading…</>
                        : <><i className="bi bi-chevron-down me-1" />Load more</>}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}