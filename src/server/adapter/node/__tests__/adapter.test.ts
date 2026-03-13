/* src/server/adapter/node/__tests__/adapter.test.ts */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { greetRouter as router } from '../../../core/typescript/__tests__/fixtures.js'
import { serveNode } from '../src/index.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

let server: Server
let base: string

function postJson(path: string, body: unknown) {
	return fetch(`${base}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
}

beforeAll(async () => {
	server = serveNode(router, { port: 0 })
	await new Promise<void>((r) => {
		if (server.listening) {
			r()
		} else {
			server.once('listening', r)
		}
	})
	const addr = server.address() as AddressInfo
	base = `http://localhost:${addr.port}`
})

afterAll(() => {
	server.close()
})

describe('adapter-node', () => {
	it('GET /_seam/manifest.json returns manifest', async () => {
		const res = await fetch(`${base}/_seam/manifest.json`)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.procedures.greet).toBeDefined()
	})

	it('POST /_seam/procedure/greet with valid input returns 200', async () => {
		const res = await postJson('/_seam/procedure/greet', { name: 'Alice' })
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body).toEqual({ ok: true, data: { message: 'Hello, Alice!' } })
	})

	it('POST /_seam/procedure/greet with invalid input returns 400', async () => {
		const res = await postJson('/_seam/procedure/greet', { name: 123 })
		expect(res.status).toBe(400)
		const body = await res.json()
		expect(body.ok).toBe(false)
		expect(body.error.code).toBe('VALIDATION_ERROR')
	})

	it('POST /_seam/procedure/unknown returns 404', async () => {
		const res = await postJson('/_seam/procedure/unknown', {})
		expect(res.status).toBe(404)
		const body = await res.json()
		expect(body.ok).toBe(false)
		expect(body.error.code).toBe('NOT_FOUND')
	})

	it('POST non-JSON body returns 400', async () => {
		const res = await fetch(`${base}/_seam/procedure/greet`, {
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
		const res = await postJson('/_seam/procedure/updateName', { name: 'test' })
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body).toEqual({ ok: true, data: { success: true } })
	})

	it('unknown route returns 404', async () => {
		const res = await fetch(`${base}/unknown`)
		expect(res.status).toBe(404)
		const body = await res.json()
		expect(body.ok).toBe(false)
		expect(body.error.code).toBe('NOT_FOUND')
	})

	it('empty procedure name returns 404', async () => {
		const res = await postJson('/_seam/procedure/', {})
		expect(res.status).toBe(404)
		const body = await res.json()
		expect(body.ok).toBe(false)
		expect(body.error.code).toBe('NOT_FOUND')
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

describe('adapter-node subscription', () => {
	it('subscription returns SSE events', async () => {
		const res = await fetch(`${base}/_seam/procedure/onCount?input=%7B%22max%22%3A2%7D`)
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toBe('text/event-stream')
		const events = parseSSE(await res.text())
		const dataEvents = events.filter((e) => e.event === 'data')
		expect(dataEvents.length).toBe(2)
		expect(JSON.parse(dataEvents[0]?.data ?? '')).toEqual({ n: 0 })
		expect(JSON.parse(dataEvents[1]?.data ?? '')).toEqual({ n: 1 })
	})

	it('unknown subscription returns SSE error', async () => {
		const res = await fetch(`${base}/_seam/procedure/nope`)
		const events = parseSSE(await res.text())
		expect(events.some((e) => e.event === 'error' && e.data?.includes('not found'))).toBe(true)
	})
})

// -- Stream tests --

describe('adapter-node stream', () => {
	it('stream returns SSE with incrementing ids', async () => {
		const res = await fetch(`${base}/_seam/procedure/countdown`, {
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
		const res = await fetch(`${base}/_seam/procedure/countdown`, {
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

// -- Public directory tests --

describe('adapter-node publicDir', () => {
	let pubServer: Server
	let pubBase: string
	let pubDir: string

	beforeAll(async () => {
		pubDir = mkdtempSync(join(tmpdir(), 'seam-node-public-'))
		writeFileSync(join(pubDir, 'hello.txt'), 'hello world')
		mkdirSync(join(pubDir, 'images'), { recursive: true })
		writeFileSync(join(pubDir, 'images', 'logo.png'), 'fake-png-data')

		pubServer = serveNode(router, { port: 0, publicDir: pubDir })
		await new Promise<void>((r) => {
			if (pubServer.listening) {
				r()
			} else {
				pubServer.once('listening', r)
			}
		})
		const addr = pubServer.address() as AddressInfo
		pubBase = `http://localhost:${addr.port}`
	})

	afterAll(() => {
		pubServer.close()
		rmSync(pubDir, { recursive: true, force: true })
	})

	it('serves existing public file', async () => {
		const res = await fetch(`${pubBase}/hello.txt`)
		expect(res.status).toBe(200)
		const body = await res.text()
		expect(body).toBe('hello world')
	})

	it('serves nested public file', async () => {
		const res = await fetch(`${pubBase}/images/logo.png`)
		expect(res.status).toBe(200)
	})

	it('blocks path traversal', async () => {
		const res = await fetch(`${pubBase}/../etc/passwd`)
		expect(res.status).toBe(404)
	})
})
