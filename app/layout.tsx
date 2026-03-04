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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-bs-theme="auto">
      <body>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  )
}