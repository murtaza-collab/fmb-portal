// app/(kitchen)/layout.tsx
'use client';

import { ReactNode, useEffect } from 'react';

export default function KitchenLayout({ children }: { children: ReactNode }) {
  // Prevent zoom on double-tap for tablets
  useEffect(() => {
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('touchstart', preventZoom, { passive: false });
    return () => document.removeEventListener('touchstart', preventZoom);
  }, []);

  return (
    <div className="kitchen-root min-vh-100 bg-light">
      <style jsx global>{`
        .kitchen-root {
          font-size: 1.25rem;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .kitchen-btn {
          min-height: 80px;
          font-size: 1.5rem;
          font-weight: 600;
          border-radius: 12px;
          padding: 1rem 2rem;
          transition: transform 0.1s;
        }
        .kitchen-btn:active {
          transform: scale(0.98);
        }
        .kitchen-card {
          border-radius: 16px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          border: none;
        }
        .kitchen-stat {
          font-size: 3rem;
          font-weight: 700;
        }
        .kitchen-header {
          font-size: 2rem;
          font-weight: 700;
          color: #212529;
        }
      `}</style>
      {children}
    </div>
  );
}