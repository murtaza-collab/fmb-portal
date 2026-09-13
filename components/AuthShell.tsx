'use client'
import { theme, alpha } from '@/lib/theme'

/**
 * Shared chrome for the public auth screens (/login, /forgot-password).
 *
 * These sit outside the (portal) and kitchen layouts, so anything those
 * layouts provide — most notably the Bootstrap Icons stylesheet — has to be
 * loaded here or the bi-* glyphs render as blank boxes.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      <style>{`
        .fmb-auth {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          /* Deep jade ground matching the sidebar, with a gold halo behind the
             mark — gold's one job in this palette is lifting a dark surface. */
          background:
            radial-gradient(900px 520px at 50% -8%, ${alpha.accent(0.26)}, transparent 62%),
            linear-gradient(180deg, ${theme.ground} 0%, ${theme.groundDeep} 100%);
          background-color: ${theme.groundDeep};
        }
        .fmb-auth-card {
          border: none;
          border-radius: 14px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
        }
        .fmb-auth .form-control {
          font-size: ${theme.text.md};
          padding: 0.6rem 0.85rem;
          border-radius: ${theme.radius};
        }
        .fmb-auth .input-group .form-control { border-right: none; }
        .fmb-auth .input-group .btn {
          border: 1px solid var(--bs-border-color);
          border-left: none;
          border-radius: 0 ${theme.radius} ${theme.radius} 0;
          color: var(--bs-secondary-color);
        }
        .fmb-auth .input-group:focus-within .form-control,
        .fmb-auth .input-group:focus-within .btn {
          border-color: var(--fmb-primary-tint-300);
        }
        .fmb-auth-link {
          color: ${theme.primaryDeep};
          font-size: ${theme.text.base};
          font-weight: 600;
          text-decoration: none;
        }
        .fmb-auth-link:hover { color: ${theme.ground}; text-decoration: underline; }
      `}</style>

      <div className="fmb-auth">
        <div style={{ width: '100%', maxWidth: 420 }}>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.75rem' }}>
            <img
              src="/fmb-logo-2-2.svg"
              alt="Faiz ul Mawaid il Burhaniyah"
              style={{ height: 84, marginBottom: 18, filter: 'brightness(0) invert(1)' }}
            />
            <h1 style={{ color: '#fff', fontSize: theme.text.lg, fontWeight: 700, letterSpacing: '0.01em', marginBottom: 4 }}>
              Faiz ul Mawaid il Burhaniyah
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: theme.text.sm, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 0 }}>
              FMB Portal
            </p>
          </div>

          <div className="card fmb-auth-card">
            <div className="card-body p-4 p-sm-5">
              <div className="text-center mb-4">
                <h2 style={{ fontSize: theme.text.lg, fontWeight: 700, color: theme.primaryDeep, marginBottom: 4 }}>{title}</h2>
                <p className="text-secondary mb-0" style={{ fontSize: theme.text.base }}>{subtitle}</p>
              </div>
              {children}
            </div>
          </div>

          <p className="text-center mt-4 mb-0" style={{ color: 'rgba(255,255,255,0.45)', fontSize: theme.text.sm }}>
            Faiz ul Mawaid il Burhaniyah © {new Date().getFullYear()}
          </p>

        </div>
      </div>
    </>
  )
}
