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

  // Check if user is active
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
    <div className="auth-page-wrapper pt-5" style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #364574, #233044)'
    }}>
      <div className="auth-page-content">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-md-8 col-lg-6 col-xl-5">

              <div className="text-center mt-5 mb-4">
                <h3 className="text-white">AMB FMB Niyaz Niyat</h3>
                <p className="text-white-50">Admin Portal</p>
              </div>

              <div className="card mt-4" style={{ borderRadius: '12px' }}>
                <div className="card-body p-4">
                  <div className="text-center mb-4">
                    <h5 className="text-primary">Welcome Back</h5>
                    <p className="text-muted">Sign in to continue</p>
                  </div>

                  {error && (
                    <div className="alert alert-danger">{error}</div>
                  )}

                  <form onSubmit={handleLogin}>
                    <div className="mb-3">
                      <label className="form-label">Username</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Enter username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Password</label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>

                    <div className="mt-4">
                      <button
                        type="submit"
                        className="btn btn-primary w-100"
                        disabled={loading}
                      >
                        {loading ? 'Signing in...' : 'Sign In'}
                      </button>
                    </div>
                  </form>

                </div>
              </div>

              <div className="mt-4 text-center">
                <p className="text-white-50 mb-0">
                  Faiz ul Mawaid il Burhaniyah © {new Date().getFullYear()}
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}