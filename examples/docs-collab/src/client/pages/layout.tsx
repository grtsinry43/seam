/* examples/docs-collab/src/client/pages/layout.tsx */

import type { ReactNode } from 'react'

export function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px', fontFamily: 'Inter, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <a href="/" style={{ textDecoration: 'none', fontWeight: 700, color: '#111827' }}>
          Seam Docs
        </a>
        <nav style={{ display: 'flex', gap: 16 }}>
          <a href="/">Docs</a>
          <a href="/admin">Admin</a>
        </nav>
      </header>
      {children}
    </div>
  )
}
