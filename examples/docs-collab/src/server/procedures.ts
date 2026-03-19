/* examples/docs-collab/src/server/procedures.ts */

import { randomUUID } from 'node:crypto'
import { fromCallback, t, query, command, subscription } from '@canmi/seam-server'

interface User {
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

interface DocumentRecord {
  slug: string
  title: string
  blocks: DocBlock[]
  updatedAt: string
  updatedBy: string
  version: number
  published: boolean
}

interface InviteRecord {
  token: string
  role: 'writer'
  createdBy: string
  createdAt: string
  acceptedBy?: string
}

interface DocEvent {
  slug: string
  type: 'doc_saved' | 'presence'
  actorId: string
  actorName: string
  at: string
  version?: number
}

const users = new Map<string, User>([
  ['admin', { id: 'admin', name: 'Administrator', role: 'admin' }],
  ['reader', { id: 'reader', name: 'Read Only User', role: 'viewer' }],
])

const invites = new Map<string, InviteRecord>()

const docs = new Map<string, DocumentRecord>([
  [
    'getting-started',
    {
      slug: 'getting-started',
      title: 'Getting started with Seam Docs',
      blocks: [
        { id: 'b1', type: 'heading', text: 'Seam Docs Demo' },
        {
          id: 'b2',
          type: 'paragraph',
          text: 'This page is prerendered for static delivery, then hydrated for collaboration.',
        },
        {
          id: 'b3',
          type: 'todo',
          text: 'Invite your first writer from /admin',
          checked: false,
        },
      ],
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin',
      version: 1,
      published: true,
    },
  ],
])

const docEventListeners = new Map<string, Set<(event: DocEvent) => void>>()

function getUserOrThrow(userId: string): User {
  const user = users.get(userId)
  if (!user) throw new Error(`Unknown user: ${userId}`)
  return user
}

function ensureAdmin(userId: string): User {
  const user = getUserOrThrow(userId)
  if (user.role !== 'admin') throw new Error('Admin permission required')
  return user
}

function ensureEditor(userId: string): User {
  const user = getUserOrThrow(userId)
  if (user.role !== 'admin' && user.role !== 'writer') {
    throw new Error('Writer or admin permission required')
  }
  return user
}

function nowIso(): string {
  return new Date().toISOString()
}

function emitDocEvent(event: DocEvent): void {
  const listeners = docEventListeners.get(event.slug)
  if (!listeners) return
  for (const emit of listeners) emit(event)
}

function withListener(slug: string, emit: (event: DocEvent) => void): () => void {
  const listeners = docEventListeners.get(slug) ?? new Set()
  listeners.add(emit)
  docEventListeners.set(slug, listeners)
  return () => {
    const current = docEventListeners.get(slug)
    if (!current) return
    current.delete(emit)
    if (current.size === 0) docEventListeners.delete(slug)
  }
}

export const listDocs = query({
  input: t.object({}),
  output: t.object({
    docs: t.array(
      t.object({
        slug: t.string(),
        title: t.string(),
        updatedAt: t.string(),
        version: t.int32(),
      }),
    ),
  }),
  cache: { ttl: 120 },
  handler: () => ({
    docs: Array.from(docs.values())
      .filter((doc) => doc.published)
      .map((doc) => ({
        slug: doc.slug,
        title: doc.title,
        updatedAt: doc.updatedAt,
        version: doc.version,
      })),
  }),
})

export const getDoc = query({
  input: t.object({ slug: t.string() }),
  output: t.object({
    slug: t.string(),
    title: t.string(),
    blocks: t.array(
      t.object({
        id: t.string(),
        type: t.enum(['heading', 'paragraph', 'todo']),
        text: t.string(),
        checked: t.optional(t.boolean()),
      }),
    ),
    updatedAt: t.string(),
    updatedBy: t.string(),
    version: t.int32(),
  }),
  cache: { ttl: 10 },
  handler: ({ input }) => {
    const doc = docs.get(input.slug)
    if (!doc || !doc.published) throw new Error(`Document not found: ${input.slug}`)
    return doc
  },
})

export const adminListMembers = query({
  input: t.object({ actorId: t.string() }),
  output: t.object({
    members: t.array(
      t.object({
        id: t.string(),
        name: t.string(),
        role: t.enum(['admin', 'writer', 'viewer']),
      }),
    ),
  }),
  handler: ({ input }) => {
    ensureAdmin(input.actorId)
    return { members: Array.from(users.values()) }
  },
})

export const createInvite = command({
  input: t.object({ actorId: t.string(), role: t.enum(['writer']) }),
  output: t.object({ token: t.string(), role: t.enum(['writer']), createdAt: t.string() }),
  handler: ({ input }) => {
    ensureAdmin(input.actorId)
    const token = randomUUID()
    const createdAt = nowIso()
    invites.set(token, {
      token,
      role: input.role,
      createdBy: input.actorId,
      createdAt,
    })
    return { token, role: input.role, createdAt }
  },
})

export const acceptInvite = command({
  input: t.object({ token: t.string(), userName: t.string() }),
  output: t.object({ userId: t.string(), role: t.enum(['writer']) }),
  handler: ({ input }) => {
    const invite = invites.get(input.token)
    if (!invite) throw new Error('Invalid invite token')
    if (invite.acceptedBy) throw new Error('Invite token already used')

    const userId = `writer-${randomUUID().slice(0, 8)}`
    users.set(userId, { id: userId, name: input.userName, role: 'writer' })
    invite.acceptedBy = userId
    invites.set(input.token, invite)

    return { userId, role: 'writer' }
  },
})

export const createDoc = command({
  input: t.object({ actorId: t.string(), slug: t.string(), title: t.string() }),
  output: t.object({ slug: t.string(), title: t.string(), version: t.int32() }),
  invalidates: ['listDocs'],
  handler: ({ input }) => {
    const actor = ensureEditor(input.actorId)
    if (docs.has(input.slug)) throw new Error(`Slug already exists: ${input.slug}`)

    const record: DocumentRecord = {
      slug: input.slug,
      title: input.title,
      blocks: [{ id: randomUUID(), type: 'paragraph', text: 'Start writing here...' }],
      updatedAt: nowIso(),
      updatedBy: actor.name,
      version: 1,
      published: true,
    }
    docs.set(record.slug, record)

    emitDocEvent({
      slug: record.slug,
      type: 'doc_saved',
      actorId: actor.id,
      actorName: actor.name,
      at: record.updatedAt,
      version: record.version,
    })

    return { slug: record.slug, title: record.title, version: record.version }
  },
})

export const saveDoc = command({
  input: t.object({
    actorId: t.string(),
    slug: t.string(),
    title: t.string(),
    blocks: t.array(
      t.object({
        id: t.string(),
        type: t.enum(['heading', 'paragraph', 'todo']),
        text: t.string(),
        checked: t.optional(t.boolean()),
      }),
    ),
    published: t.optional(t.boolean()),
  }),
  output: t.object({ slug: t.string(), version: t.int32(), updatedAt: t.string() }),
  invalidates: ['listDocs', { query: 'getDoc', mapping: { slug: { from: 'slug' } } }],
  handler: ({ input }) => {
    const actor = ensureEditor(input.actorId)
    const current = docs.get(input.slug)
    if (!current) throw new Error(`Document not found: ${input.slug}`)

    const updatedAt = nowIso()
    const next: DocumentRecord = {
      ...current,
      title: input.title,
      blocks: input.blocks,
      updatedAt,
      updatedBy: actor.name,
      version: current.version + 1,
      published: input.published ?? current.published,
    }
    docs.set(next.slug, next)

    emitDocEvent({
      slug: next.slug,
      type: 'doc_saved',
      actorId: actor.id,
      actorName: actor.name,
      at: updatedAt,
      version: next.version,
    })

    return { slug: next.slug, version: next.version, updatedAt }
  },
})

export const presencePing = command({
  input: t.object({ actorId: t.string(), slug: t.string() }),
  output: t.object({ ok: t.boolean() }),
  handler: ({ input }) => {
    const actor = ensureEditor(input.actorId)
    emitDocEvent({
      slug: input.slug,
      type: 'presence',
      actorId: actor.id,
      actorName: actor.name,
      at: nowIso(),
    })
    return { ok: true }
  },
})

export const onDocEvent = subscription({
  input: t.object({ slug: t.string() }),
  output: t.object({
    slug: t.string(),
    type: t.enum(['doc_saved', 'presence']),
    actorId: t.string(),
    actorName: t.string(),
    at: t.string(),
    version: t.optional(t.int32()),
  }),
  handler: ({ input }) =>
    fromCallback<DocEvent>(({ emit }) => {
      const cleanup = withListener(input.slug, emit)
      return cleanup
    }),
})
