'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export default function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const prevPath = useRef<string>('')

  const currentPath = pathname + searchParams.toString()

  // Start progress bar on path change
  useEffect(() => {
    if (prevPath.current === currentPath) return
    prevPath.current = currentPath

    // Reset and start
    setProgress(0)
    setVisible(true)

    // Quick jump to 20%
    setTimeout(() => setProgress(20), 50)
    // Crawl to 70% over 300ms
    setTimeout(() => setProgress(70), 200)
    // Crawl to 85%
    setTimeout(() => setProgress(85), 500)

    // Complete after a short delay
    timerRef.current = setTimeout(() => {
      setProgress(100)
      setTimeout(() => setVisible(false), 300)
    }, 800)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [currentPath])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        height: '3px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #ffbf69, #364574)',
          transition: progress === 100
            ? 'width 0.2s ease, opacity 0.3s ease'
            : 'width 0.4s ease',
          opacity: progress === 100 ? 0 : 1,
          boxShadow: '0 0 8px rgba(54, 69, 116, 0.6)',
          borderRadius: '0 2px 2px 0',
        }}
      />
    </div>
  )
}