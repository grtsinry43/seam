/* src/server/core/typescript/__tests__/dev-reload-sse.test.ts */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHttpHandler, createRouter } from '../src/index.js'

function req(handler: ReturnType<typeof createHttpHandler>, method: string, url: string) {
	return handler({
		method,
		url: `http://localhost${url}`,
		body: () => Promise.reject(new Error('no body')),
	})
}

describe('dev reload SSE endpoint', () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'seam-dev-reload-'))
		// Write a minimal route-manifest so loadBuildDev doesn't crash
		writeFileSync(join(tmpDir, 'route-manifest.json'), JSON.stringify({ routes: {} }))
		writeFileSync(join(tmpDir, '.reload-trigger'), '')
	})

	afterEach(() => {
		// Cleanup env vars
		delete process.env.SEAM_DEV
		delete process.env.SEAM_VITE
		delete process.env.SEAM_OUTPUT_DIR
	})

	it('returns 200 with text/event-stream when devBuildDir is set', async () => {
		const router = createRouter({ procedures: {} })
		const handler = createHttpHandler(router, { devBuildDir: tmpDir })
		const res = await req(handler, 'GET', '/_seam/dev/reload')

		expect(res.status).toBe(200)
		expect(res.headers['Content-Type']).toBe('text/event-stream')
		expect(res.headers['Cache-Control']).toBe('no-cache')
		expect(res.headers['X-Accel-Buffering']).toBe('no')
		expect('stream' in res).toBe(true)
	})

	it('first chunk is ": connected" comment for header flushing', async () => {
		const router = createRouter({ procedures: {} })
		const handler = createHttpHandler(router, { devBuildDir: tmpDir })
		const res = await req(handler, 'GET', '/_seam/dev/reload')

		if (!('stream' in res)) throw new Error('expected stream response')

		const chunks: string[] = []
		for await (const chunk of res.stream) {
			chunks.push(chunk)
			// Stop after the first real chunk (the ': connected' comment)
			if (chunks.length >= 1) break
		}
		expect(chunks[0]).toBe(': connected\n\n')
	})

	it('returns 404 when devBuildDir is not set', async () => {
		const router = createRouter({ procedures: {} })
		const handler = createHttpHandler(router)
		const res = await req(handler, 'GET', '/_seam/dev/reload')

		expect(res.status).toBe(404)
	})

	it('yields reload event when .reload-trigger changes', async () => {
		const router = createRouter({ procedures: {} })
		const handler = createHttpHandler(router, { devBuildDir: tmpDir })
		const res = await req(handler, 'GET', '/_seam/dev/reload')

		if (!('stream' in res)) throw new Error('expected stream response')

		const chunks: string[] = []
		const timeout = setTimeout(() => res.onCancel?.(), 3000)

		// Touch the trigger file after a short delay to fire reload
		setTimeout(() => {
			writeFileSync(join(tmpDir, '.reload-trigger'), String(Date.now()))
		}, 100)

		try {
			for await (const chunk of res.stream) {
				chunks.push(chunk)
				// We expect ": connected", then "data: reload" (possibly with heartbeats between)
				if (chunks.some((c) => c.includes('data: reload'))) break
			}
		} finally {
			clearTimeout(timeout)
			res.onCancel?.()
		}

		expect(chunks[0]).toBe(': connected\n\n')
		expect(chunks.some((c) => c === 'data: reload\n\n')).toBe(true)
	})
})
