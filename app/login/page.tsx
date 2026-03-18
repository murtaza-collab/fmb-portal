'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const email = `${username.toLowerCase().trim()}@fmb.internal`

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Invalid username or password')
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
      setError('Your account has been deactivated. Please contact admin.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #364574, #233044)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <div style={{ width: '100%', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>

        {/* Logo + title */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
          <img
            src="/fmb-logo-2-2.svg"
            alt="FMB"
            style={{ height: 90, marginBottom: 20, filter: 'brightness(0) invert(1)' }}
          />
          <h3 className="text-white fw-bold mb-1">Faiz Ul Mawaid Il Burhaniyah</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 0 }}>FMB Portal</p>
        </div>

        {/* Card */}
        <div className="card border-0 shadow-lg" style={{ borderRadius: 16 }}>
          <div className="card-body p-4 p-md-5">

            <div className="text-center mb-4">
              <h5 className="fw-bold mb-1" style={{ color: '#364574' }}>Welcome</h5>
              <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>Sign in to continue</p>
            </div>

            {error && (
              <div className="alert alert-danger py-2" style={{ fontSize: '0.9rem' }}>
                <i className="bi bi-exclamation-triangle me-2"></i>{error}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="mb-3">
                <label className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>
                  Username
                </label>
                <input
                  type="text"
                  className="form-control form-control-lg"
                  placeholder="Enter username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>

              <div className="mb-4">
                <label className="form-label fw-semibold" style={{ fontSize: '0.9rem' }}>
                  Password
                </label>
                <input
                  type="password"
                  className="form-control form-control-lg"
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-lg w-100 fw-bold text-white"
                style={{ background: '#364574', border: 'none', borderRadius: 8 }}
                disabled={loading}
              >
                {loading
                  ? <><span className="spinner-border spinner-border-sm me-2"></span>Signing in…</>
                  : 'Sign In'
                }
              </button>
            </form>

          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-4">
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', marginBottom: 0 }}>
            Faiz ul Mawaid il Burhaniyah © {new Date().getFullYear()}
          </p>
        </div>

      </div>
    </div>
  )
}