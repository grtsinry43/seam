/* examples/docs-collab/src/client/pages/home-page.tsx */

import { useMemo, useState, useEffect } from 'react'
import { useSeamData } from '@canmi/seam-react'
import { useSeamFetch } from 'virtual:seam/hooks'

interface DocSummary {
  slug: string
  title: string
  updatedAt: string
  version: number
}

interface DocBlock {
  id: string
  type: 'heading' | 'paragraph' | 'todo'
  text: string
  checked?: boolean
}

interface DocPayload {
  slug: string
  title: string
  blocks: DocBlock[]
  updatedAt: string
  updatedBy: string
  version: number
}

interface HomePageData extends Record<string, unknown> {
  docs: { docs: DocSummary[] }
  doc?: DocPayload
}

function renderBlock(block: DocBlock) {
  if (block.type === 'heading') return <h2 key={block.id}>{block.text}</h2>
  if (block.type === 'todo') {
    return (
      <label key={block.id} style={{ display: 'block', marginBottom: 8 }}>
        <input type="checkbox" checked={!!block.checked} readOnly /> {block.text}
      </label>
    )
  }
  return (
    <p key={block.id} style={{ lineHeight: 1.7 }}>
      {block.text}
    </p>
  )
}

export function DocsHomePage() {
  const seeded = useSeamData<HomePageData>()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const docsResult = mounted ? useSeamFetch('listDocs', {}) : { data: seeded.docs, pending: false }

  const slug = useMemo(() => {
    if (typeof window === 'undefined') return seeded.doc?.slug ?? 'getting-started'
    const params = new URLSearchParams(window.location.search)
    return params.get('slug') ?? seeded.doc?.slug ?? 'getting-started'
  }, [seeded.doc?.slug])

  const docResult = mounted
    ? useSeamFetch('getDoc', { slug })
    : { data: seeded.doc, pending: false as boolean }

  const docs = docsResult.data?.docs ?? []
  const doc = docResult.data

  return (
    <main style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
      <aside style={{ borderRight: '1px solid #e5e7eb', paddingRight: 14 }}>
        <h3 style={{ marginTop: 0 }}>Docs Index</h3>
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          This route is prerendered (static-first). After hydration, data refreshes from live procedures.
        </p>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {docs.map((item) => (
            <li key={item.slug} style={{ marginBottom: 8 }}>
              <a href={`/?slug=${item.slug}`}>{item.title}</a>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        {docResult.pending ? <p>Loading document...</p> : null}
        {doc ? (
          <article>
            <h1>{doc.title}</h1>
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Updated by {doc.updatedBy} · version {doc.version}
            </p>
            <div>{doc.blocks.map(renderBlock)}</div>
          </article>
        ) : (
          <p>No document selected.</p>
        )}
      </section>
    </main>
  )
}
