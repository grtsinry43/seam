/* src/cli/pkg/__tests__/vite-cache.test.ts */

import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
	computeViteCacheFingerprint,
	gcViteCache,
	prepareViteCache,
	releaseViteCache,
} from '../scripts/vite-cache.mjs'

const tempDirs: string[] = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

function createProject() {
	const dir = mkdtempSync(join(tmpdir(), 'seam-vite-cache-'))
	tempDirs.push(dir)
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0' }))
	writeFileSync(join(dir, 'bun.lock'), 'lock-v1')
	return dir
}

describe('vite cache fingerprinting', () => {
	it('changes when dependency inputs change', () => {
		const project = createProject()
		const before = computeViteCacheFingerprint(project)

		writeFileSync(join(project, 'bun.lock'), 'lock-v2')
		const after = computeViteCacheFingerprint(project)

		expect(after).not.toBe(before)
	})

	it('stores caches under .seam/dev-output/vite-cache/<fingerprint>', () => {
		const project = createProject()
		const context = prepareViteCache({ projectRoot: project })

		expect(context.cacheDir).toContain('.seam/dev-output/vite-cache/fingerprints/')
		expect(context.cacheDir.endsWith(context.fingerprint)).toBe(true)

		releaseViteCache(context)
	})

	it('garbage collects stale fingerprints while preserving the active one', () => {
		const project = createProject()
		const context = prepareViteCache({ projectRoot: project })
		const staleDir = join(context.cacheRoot, 'fingerprints', 'stale-fingerprint')
		mkdirSync(staleDir, { recursive: true })

		gcViteCache(context.cacheRoot, [context.fingerprint])

		expect(existsSync(staleDir)).toBe(false)
		expect(existsSync(context.cacheDir)).toBe(true)

		releaseViteCache(context)
	})
})
