'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { theme } from '@/lib/theme'
import AuthShell from '@/components/AuthShell'

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary to keep this page prerenderable.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  // The portal layout bounces deactivated users here as /login?error=inactive.
  // Derived rather than stored, so it survives a re-render without an effect.
  const error = submitError || (searchParams.get('error') === 'inactive'
    ? 'Your account has been deactivated. Please contact admin.'
    : '')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSubmitError('')

    const email = `${username.toLowerCase().trim()}@fmb.internal`

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setSubmitError('Invalid username or password')
      setLoading(false)
      return
    }

    const { data: adminData } = await supabase
      .from('admin_users')
      .select('status')
      .ilike('username', username.trim())
      .single()

    if (!adminData || adminData.status !== 'active') {
      await supabase.auth.signOut()
      setSubmitError('Your account has been deactivated. Please contact admin.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue">
      {error && (
        <div className="alert alert-danger d-flex align-items-start gap-2 py-2 px-3"
          role="alert" aria-live="polite"
          style={{ fontSize: theme.text.base, borderRadius: theme.radius }}>
          <i className="bi bi-exclamation-triangle-fill" style={{ lineHeight: 1.5 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleLogin}>
        <div className="mb-3">
          <label htmlFor="username" className="form-label fw-semibold" style={{ fontSize: theme.text.base }}>
            Username
          </label>
          <input
            id="username"
            type="text"
            className="form-control"
            placeholder="Enter username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>

        <div className="mb-2">
          <label htmlFor="password" className="form-label fw-semibold" style={{ fontSize: theme.text.base }}>
            Password
          </label>
          <div className="input-group">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className="form-control"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="btn"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
            </button>
          </div>
        </div>

        <div className="text-end mb-4">
          <Link href="/forgot-password" className="fmb-auth-link">Forgot password?</Link>
        </div>

        <button
          type="submit"
          className="btn btn-primary w-100 fw-bold text-white"
          style={{ fontSize: theme.text.md, padding: '0.6rem', borderRadius: theme.radius }}
          disabled={loading}
        >
          {loading
            ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Signing in…</>
            : 'Sign In'
          }
        </button>
      </form>
    </AuthShell>
  )
}
