'use client'
import { useState } from 'react'
import Link from 'next/link'
import { theme } from '@/lib/theme'
import AuthShell from '@/components/AuthShell'

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      })
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Something went wrong — please try again')
        setLoading(false)
        return
      }

      setSubmitted(true)
    } catch {
      setError('Could not reach the server — check your connection and try again')
    }
    setLoading(false)
  }

  if (submitted) {
    return (
      <AuthShell title="Request sent" subtitle="An admin will take it from here">
        <div className="text-center">
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--fmb-primary-tint-050)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
          }}>
            <i className="bi bi-check-lg" style={{ fontSize: 28, color: theme.primaryDeep }} />
          </div>

          <p style={{ fontSize: theme.text.base, marginBottom: '0.5rem' }}>
            Your password reset request for <strong>@{username.trim()}</strong> has been sent to the
            portal administrators.
          </p>
          <p className="text-secondary" style={{ fontSize: theme.text.base }}>
            An admin will set a new password for you and pass it on directly. There is nothing
            further to do here.
          </p>

          <Link
            href="/login"
            className="btn btn-primary w-100 fw-bold text-white mt-2"
            style={{ fontSize: theme.text.md, padding: '0.6rem', borderRadius: theme.radius }}
          >
            Back to Sign In
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Forgot password" subtitle="Enter your username to request a reset">
      {error && (
        <div className="alert alert-danger d-flex align-items-start gap-2 py-2 px-3"
          role="alert" aria-live="polite"
          style={{ fontSize: theme.text.base, borderRadius: theme.radius }}>
          <i className="bi bi-exclamation-triangle-fill" style={{ lineHeight: 1.5 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="username" className="form-label fw-semibold" style={{ fontSize: theme.text.base }}>
            Username
          </label>
          <input
            id="username"
            type="text"
            className="form-control"
            placeholder="Enter your username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <div className="form-text" style={{ fontSize: theme.text.sm }}>
            This is the username you sign in with — not your ITS or SF number.
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary w-100 fw-bold text-white"
          style={{ fontSize: theme.text.md, padding: '0.6rem', borderRadius: theme.radius }}
          disabled={loading || !username.trim()}
        >
          {loading
            ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Sending…</>
            : 'Request Password Reset'
          }
        </button>
      </form>

      <div className="text-center mt-4">
        <Link href="/login" className="fmb-auth-link">
          <i className="bi bi-arrow-left me-1" />Back to Sign In
        </Link>
      </div>
    </AuthShell>
  )
}
