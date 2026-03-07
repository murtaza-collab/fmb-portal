'use client';

// app/kitchen/layout.tsx
// Kitchen-specific layout — no sidebar, but has a slim topbar with:
//   • FMB Kitchen branding (left)
//   • Live clock + date (center)
//   • Theme toggle Light / Dark / System (right)
//
// Theme uses the SAME fmb-theme localStorage key as the portal layout,
// so the choice is shared across both interfaces.

import { useState, useEffect, useRef } from 'react';

type Theme = 'light' | 'dark' | 'system';

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-bs-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-bs-theme', theme);
  }
}

function saveTheme(theme: Theme) {
  localStorage.setItem('fmb-theme', theme);
}

function loadTheme(): Theme {
  return (localStorage.getItem('fmb-theme') as Theme) || 'light';
}

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [theme, setTheme] = useState<Theme>('light');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Hydration-safe clock
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load saved theme on mount
  useEffect(() => {
    const saved = loadTheme();
    setTheme(saved);
    applyTheme(saved);

    // Watch system preference changes when theme = 'system'
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (loadTheme() === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Close theme dropdown when clicking outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const handleThemeSelect = (t: Theme) => {
    setTheme(t);
    saveTheme(t);
    applyTheme(t);
    setThemeMenuOpen(false);
  };

  const themeIcon = (t: Theme) => {
    if (t === 'light') return '☀️';
    if (t === 'dark') return '🌙';
    return '◑';
  };

  const themeLabel = (t: Theme) => {
    if (t === 'light') return 'Light';
    if (t === 'dark') return 'Dark';
    return 'System';
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

  return (
    <>
      {/* ── Topbar ── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          background: 'var(--bs-body-bg)',
          borderBottom: '1px solid var(--bs-border-color)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        {/* Left — branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#364574',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="bi bi-truck" style={{ color: '#fff', fontSize: 15 }}></i>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--bs-body-color)', lineHeight: 1.2 }}>
              FMB Kitchen
            </div>
            <div style={{ fontSize: 11, color: 'var(--bs-secondary-color)', lineHeight: 1.2 }}>
              Operations Portal
            </div>
          </div>
        </div>

        {/* Center — live clock */}
        <div style={{ textAlign: 'center' }}>
          {currentTime ? (
            <>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: 1,
                  color: 'var(--bs-body-color)',
                  lineHeight: 1.2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatTime(currentTime)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--bs-secondary-color)', lineHeight: 1.2 }}>
                {formatDate(currentTime)}
              </div>
            </>
          ) : (
            <div style={{ width: 160, height: 36 }} /> /* placeholder to prevent layout shift */
          )}
        </div>

        {/* Right — theme toggle */}
        <div ref={themeMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setThemeMenuOpen(o => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'var(--bs-tertiary-bg)',
              border: '1px solid var(--bs-border-color)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--bs-body-color)',
            }}
          >
            <span>{themeIcon(theme)}</span>
            <span>{themeLabel(theme)}</span>
            <i className="bi bi-chevron-down" style={{ fontSize: 11, color: 'var(--bs-secondary-color)' }}></i>
          </button>

          {themeMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: 'var(--bs-body-bg)',
                border: '1px solid var(--bs-border-color)',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                minWidth: 150,
                overflow: 'hidden',
                zIndex: 999,
              }}
            >
              {(['light', 'dark', 'system'] as Theme[]).map(t => (
                <button
                  key={t}
                  onClick={() => handleThemeSelect(t)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 14px',
                    background: theme === t ? 'var(--bs-secondary-bg)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--bs-body-color)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ color: '#ffbf69', fontSize: 15 }}>{themeIcon(t)}</span>
                  <span style={{ flex: 1 }}>{themeLabel(t)}</span>
                  {theme === t && (
                    <i className="bi bi-check2" style={{ color: '#0ab39c', fontWeight: 700 }}></i>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Page content ── */}
      <div style={{ background: 'var(--bs-tertiary-bg)', minHeight: 'calc(100vh - 56px)' }}>
        {children}
      </div>

      {/* ── Bootstrap Icons CDN (kitchen pages may not inherit portal head tags) ── */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
      />
    </>
  );
}