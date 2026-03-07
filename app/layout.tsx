import type { Metadata } from 'next'
import { Suspense } from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
import './globals.css'
import NavigationProgress from '@/components/NavigationProgress'

export const metadata: Metadata = {
  title: 'FMB Portal — Faiz ul Mawaid il Burhaniyah',
  description: 'FMB Portal Admin — Mumineen, Thaali Distribution & Kitchen Operations',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-bs-theme starts as 'light' — portal layout JS immediately overrides
    // this from localStorage before first paint, preventing flash
    <html lang="en" data-bs-theme="light" suppressHydrationWarning>
      <head>
        {/* Inline script: apply saved theme BEFORE React hydrates to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var t = localStorage.getItem('fmb-theme') || 'light';
              var isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
            } catch(e) {}
          })();
        `}} />
      </head>
      <body>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  )
}