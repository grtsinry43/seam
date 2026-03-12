/* src/server/adapter/hono/__tests__/adapter.test.ts */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Hono } from 'hono'
import { createRouter } from '../../../core/typescript/src/index.js'
import { greetRouter } from '../../../core/typescript/__tests__/fixtures.js'
import { seam } from '../src/index.js'

const app = new Hono()
app.use('/*', seam(greetRouter))
app.get('/hello', (c) => c.text('world'))

function post(path: string, body: unknown) {
	return app.request(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
}

describe('adapter-hono', () => {
	it('GET /_seam/manifest.json returns manifest', async () => {
		const res = await app.request('/_seam/manifest.json')
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.procedures.greet).toBeDefined()
	})

	it('POST /_seam/procedure/greet with valid input returns 200', async () => {
		const res = await post('/_seam/procedure/greet', { name: 'Alice' })
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body).toEqual({ ok: true, data: { message: 'Hello, Alice!' } })
	})

	it('POST /_seam/procedure/greet with invalid input returns 400', async () => {
		const res = await post('/_seam/procedure/greet', { name: 123 })
		expect(res.status).toBe(400)
		const body = await res.json()
		expect(body.ok).toBe(false)
		expect(body.error.code).toBe('VALIDATION_ERROR')
	})

	it('POST /_seam/procedure/unknown returns 404', async () => {
		const res = await post('/_seam/procedure/unknown', {})
		expect(res.status).toBe(404)
		const body = await res.json()
		expect(body.ok).toBe(false)
		expect(body.error.code).toBe('NOT_FOUND')
	})

	it('POST non-JSON body returns 400', async () => {
		const res = await app.request('/_seam/procedure/greet', {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: 'not json',
		})
		expect(res.status).toBe(400)
		const body = await res.json()
		expect(body.ok).toBe(false)
		expect(body.error.code).toBe('VALIDATION_ERROR')
	})

	it('POST /_seam/procedure/updateName (command) returns 200', async () => {
		const res = await post('/_seam/procedure/updateName', { name: 'test' })
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body).toEqual({ ok: true, data: { success: true } })
	})

	it('non-/_seam/ route passes through to next middleware', async () => {
		const res = await app.request('/hello')
		expect(res.status).toBe(200)
		const text = await res.text()
		expect(text).toBe('world')
	})

	it('serves router publicDir without explicit adapter option', async () => {
		const publicDir = mkdtempSync(join(tmpdir(), 'seam-hono-public-'))
		try {
			mkdirSync(join(publicDir, 'images'), { recursive: true })
			writeFileSync(join(publicDir, 'images/logo.png'), 'png')

			const app = new Hono()
			const router = createRouter(greetRouter.procedures, { publicDir })
			app.use('/*', seam(router))

			const res = await app.request('/images/logo.png')
			expect(res.status).toBe(200)
			expect(await res.text()).toBe('png')
		} finally {
			rmSync(publicDir, { recursive: true, force: true })
		}
	})
})

// -- SSE helpers --

interface SseEvent {
	event?: string
	id?: string
	data?: string
}

function parseSSE(text: string): SseEvent[] {
	return text
		.split('\n\n')
		.filter((block) => block.trim())
		.map((block) => {
			const evt: SseEvent = {}
			for (const line of block.split('\n')) {
				if (line.startsWith('event: ')) evt.event = line.slice(7)
				else if (line.startsWith('id: ')) evt.id = line.slice(4)
				else if (line.startsWith('data: ')) evt.data = line.slice(6)
			}
			return evt
		})
}

// -- Subscription tests --

describe('adapter-hono subscription', () => {
	it('subscription returns SSE events', async () => {
		const res = await app.request('/_seam/procedure/onCount?input=%7B%22max%22%3A2%7D')
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toBe('text/event-stream')
		const events = parseSSE(await res.text())
		const dataEvents = events.filter((e) => e.event === 'data')
		expect(dataEvents.length).toBe(2)
		expect(JSON.parse(dataEvents[0]?.data ?? '')).toEqual({ n: 0 })
		expect(JSON.parse(dataEvents[1]?.data ?? '')).toEqual({ n: 1 })
	})

	it('unknown subscription returns SSE error', async () => {
		const res = await app.request('/_seam/procedure/nope')
		const events = parseSSE(await res.text())
		expect(events.some((e) => e.event === 'error' && e.data?.includes('not found'))).toBe(true)
	})
})

// -- Stream tests --

describe('adapter-hono stream', () => {
	it('stream returns SSE with incrementing ids', async () => {
		const res = await app.request('/_seam/procedure/countdown', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ max: 2 }),
		})
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toBe('text/event-stream')
		const events = parseSSE(await res.text())
		const dataEvents = events.filter((e) => e.event === 'data')
		expect(dataEvents[0]?.id).toBe('0')
		expect(dataEvents[1]?.id).toBe('1')
		expect(JSON.parse(dataEvents[0]?.data ?? '')).toEqual({ n: 2 })
		expect(JSON.parse(dataEvents[1]?.data ?? '')).toEqual({ n: 1 })
		expect(events.some((e) => e.event === 'complete')).toBe(true)
	})

	it('stream invalid input returns SSE error', async () => {
		const res = await app.request('/_seam/procedure/countdown', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ max: 'bad' }),
		})
		const events = parseSSE(await res.text())
		expect(events.some((e) => e.event === 'error' && e.data?.includes('validation failed'))).toBe(
			true,
		)
	})
})

// -- Upload tests --

describe('adapter-hono upload', () => {
	it('upload multipart returns success', async () => {
		const form = new FormData()
		form.append('metadata', JSON.stringify({ title: 'Doc' }))
		form.append('file', new Blob(['hello'], { type: 'application/octet-stream' }), 'test.txt')
		const res = await app.request('/_seam/procedure/uploadFile', {
			method: 'POST',
			body: form,
		})
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body).toEqual({ ok: true, data: { title: 'Doc', received: true } })
	})

	it('upload without file returns 400', async () => {
		const res = await post('/_seam/procedure/uploadFile', { title: 'Doc' })
		expect(res.status).toBe(400)
		const body = await res.json()
		expect(body.error.code).toBe('VALIDATION_ERROR')
	})
})
