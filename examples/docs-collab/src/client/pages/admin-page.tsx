/* examples/docs-collab/src/client/pages/admin-page.tsx */

import { useEffect, useMemo, useState } from 'react'
import { useSeamData, useSeamSubscription } from '@canmi/seam-react'
import { seamRpc } from '@canmi/seam-client/rpc'
import { useSeamFetch, useSeamMutation } from 'virtual:seam/hooks'

interface DocSummary {
  slug: string
  title: string
  updatedAt: string
  version: number
}

interface Member {
  id: string
  name: string
  role: 'admin' | 'writer' | 'viewer'
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

interface AdminPageData extends Record<string, unknown> {
  docs: { docs: DocSummary[] }
  members?: { members: Member[] }
}

interface DocEvent {
  slug: string
  type: 'doc_saved' | 'presence'
  actorId: string
  actorName: string
  at: string
  version?: number
}

function normalizeBlocks(input: string): DocBlock[] {
  return input
    .split('\n')
    .map((line, index) => {
      const raw = line.trimEnd()
      if (raw.startsWith('# ')) {
        return { id: `h-${index}`, type: 'heading' as const, text: raw.slice(2) }
      }
      if (raw.startsWith('- [x] ') || raw.startsWith('- [ ] ')) {
        return {
          id: `t-${index}`,
          type: 'todo' as const,
          checked: raw.startsWith('- [x] '),
          text: raw.slice(6),
        }
      }
      return { id: `p-${index}`, type: 'paragraph' as const, text: raw || ' ' }
    })
    .filter((block) => block.text.length > 0)
}

function stringifyBlocks(blocks: DocBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'heading') return `# ${block.text}`
      if (block.type === 'todo') return `- [${block.checked ? 'x' : ' '}] ${block.text}`
      return block.text
    })
    .join('\n')
}

export function AdminPage() {
  const seeded = useSeamData<AdminPageData>()
  const [mounted, setMounted] = useState(false)
  const [actorId, setActorId] = useState('admin')
  const [token, setToken] = useState('')
  const [inviteOutput, setInviteOutput] = useState('')
  const [newWriterName, setNewWriterName] = useState('')
  const [slug, setSlug] = useState('getting-started')
  const [title, setTitle] = useState('Getting started with Seam Docs')
  const [editorText, setEditorText] = useState('')
  const [eventLog, setEventLog] = useState<string[]>([])

  useEffect(() => setMounted(true), [])

  const docsResult = mounted ? useSeamFetch('listDocs', {}) : { data: seeded.docs, pending: false }
  const docResult = mounted
    ? useSeamFetch('getDoc', { slug })
    : ({ data: null, pending: false } as { data: DocPayload | null; pending: boolean })

  const membersResult = mounted
    ? useSeamFetch('adminListMembers', { actorId })
    : { data: seeded.members ?? { members: [] }, pending: false }

  const createInviteMutation = useSeamMutation('createInvite')
  const acceptInviteMutation = useSeamMutation('acceptInvite')
  const saveDocMutation = useSeamMutation('saveDoc')
  const createDocMutation = useSeamMutation('createDoc')
  const presenceMutation = useSeamMutation('presencePing')

  const latestEvent = useSeamSubscription<DocEvent>('', 'onDocEvent', { slug })

  useEffect(() => {
    if (!docResult.data) return
    setTitle(docResult.data.title)
    setEditorText(stringifyBlocks(docResult.data.blocks))
  }, [docResult.data?.slug, docResult.data?.version])

  useEffect(() => {
    if (!latestEvent.data) return
    const line = `${latestEvent.data.type} · ${latestEvent.data.actorName} · ${latestEvent.data.at}`
    setEventLog((prev) => [line, ...prev].slice(0, 8))
  }, [latestEvent.data])

  const docs = docsResult.data?.docs ?? []
  const members = membersResult.data?.members ?? []

  const canEdit = useMemo(() => {
    return members.some((member) => member.id === actorId && (member.role === 'admin' || member.role === 'writer'))
  }, [members, actorId])

  async function onCreateInvite() {
    const output = await createInviteMutation.mutateAsync({ actorId, role: 'writer' })
    setInviteOutput(`Invite token: ${output.token}`)
    setToken(output.token)
  }

  async function onAcceptInvite() {
    if (!token || !newWriterName) return
    const output = await acceptInviteMutation.mutateAsync({ token, userName: newWriterName })
    setActorId(output.userId)
    setInviteOutput(`Accepted. Current actor switched to ${output.userId}`)
  }

  async function onSaveDoc() {
    await saveDocMutation.mutateAsync({
      actorId,
      slug,
      title,
      blocks: normalizeBlocks(editorText),
      published: true,
    })
  }

  async function onCreateDoc() {
    const nextSlug = `doc-${Math.random().toString(16).slice(2, 8)}`
    await createDocMutation.mutateAsync({ actorId, slug: nextSlug, title: 'New collaborative doc' })
    setSlug(nextSlug)
  }

  async function onPresencePing() {
    await presenceMutation.mutateAsync({ actorId, slug })
  }

  return (
    <main>
      <h1>Admin Studio</h1>
      <p style={{ color: '#6b7280' }}>
        Use actorId to simulate permissions. Admin can invite writers. Writers can edit and broadcast live events.
      </p>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 8 }}>
          <h3>Identity & Permissions</h3>
          <label>
            actorId:{' '}
            <input value={actorId} onChange={(event) => setActorId(event.target.value)} style={{ width: 220 }} />
          </label>
          <div style={{ marginTop: 8 }}>
            <button onClick={onCreateInvite} disabled={createInviteMutation.isPending}>
              Admin invite writer
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <input
              placeholder="invite token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              style={{ width: '100%' }}
            />
            <input
              placeholder="writer name"
              value={newWriterName}
              onChange={(event) => setNewWriterName(event.target.value)}
              style={{ width: '100%', marginTop: 6 }}
            />
            <button onClick={onAcceptInvite} disabled={acceptInviteMutation.isPending} style={{ marginTop: 6 }}>
              Accept invite
            </button>
          </div>
          {inviteOutput ? <p>{inviteOutput}</p> : null}
          <p>Current actor can edit: {canEdit ? 'yes' : 'no'}</p>
          <h4>Members</h4>
          <ul>
            {members.map((member) => (
              <li key={member.id}>
                {member.name} ({member.role})
              </li>
            ))}
          </ul>
        </div>

        <div style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 8 }}>
          <h3>Realtime events</h3>
          <p>Subscription status: {latestEvent.status}</p>
          <button onClick={onPresencePing} disabled={presenceMutation.isPending}>
            Ping presence
          </button>
          <ul>
            {eventLog.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ marginTop: 16, border: '1px solid #e5e7eb', padding: 12, borderRadius: 8 }}>
        <h3>Document editor (Notion-like block text)</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>
            slug:{' '}
            <select value={slug} onChange={(event) => setSlug(event.target.value)}>
              {docs.map((doc) => (
                <option key={doc.slug} value={doc.slug}>
                  {doc.slug}
                </option>
              ))}
            </select>
          </label>
          <button onClick={onCreateDoc} disabled={!canEdit || createDocMutation.isPending}>
            Create doc
          </button>
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Document title"
          style={{ width: '100%', marginTop: 8 }}
        />
        <textarea
          value={editorText}
          onChange={(event) => setEditorText(event.target.value)}
          rows={16}
          style={{ width: '100%', marginTop: 8, fontFamily: 'ui-monospace, monospace' }}
          placeholder={'# Heading\nParagraph text\n- [ ] TODO item'}
        />
        <button onClick={onSaveDoc} disabled={!canEdit || saveDocMutation.isPending}>
          Save doc
        </button>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Hydration behavior</h3>
        <p>
          Static docs route is prerendered. Admin becomes interactive after hydration with mutation + subscription.
          This page mounted: {mounted ? 'yes' : 'no'}.
        </p>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Live document snapshot</h3>
        {docResult.pending ? <p>Loading...</p> : null}
        {docResult.data ? (
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f9fafb', padding: 12, borderRadius: 8 }}>
            {JSON.stringify(docResult.data, null, 2)}
          </pre>
        ) : null}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Direct RPC sample</h3>
        <button
          onClick={async () => {
            const data = await seamRpc('listDocs', {})
            setEventLog((prev) => [`manual seamRpc listDocs: ${JSON.stringify(data)}`, ...prev].slice(0, 8))
          }}
        >
          Call seamRpc('listDocs')
        </button>
      </section>
    </main>
  )
}
