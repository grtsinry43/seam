/* tests/e2e/specs/vite-dev.spec.ts */
/* oxlint-disable no-promise-executor-return */

import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import path from 'node:path'

const seamBin = path.resolve(
	__dirname,
	`../../../target/${process.env.SEAM_PROFILE || 'release'}/seam`,
)
const appDir = path.resolve(__dirname, '../../../examples/github-dashboard/seam-app')
const appPort = Number(process.env.SEAM_E2E_VITE_APP_PORT)
const vitePort = Number(process.env.SEAM_E2E_VITE_HMR_PORT)

if (!Number.isInteger(appPort) || !Number.isInteger(vitePort)) {
	throw new Error('SEAM_E2E_VITE_APP_PORT and SEAM_E2E_VITE_HMR_PORT must be set')
}

function tryConnect(port: number, host: string): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ port, host }, () => {
			socket.destroy()
			resolve(true)
		})
		socket.on('error', () => {
			socket.destroy()
			resolve(false)
		})
	})
}

async function waitForPort(port: number, timeout = 30_000): Promise<void> {
	const deadline = Date.now() + timeout
	while (Date.now() < deadline) {
		// Try IPv6 first — Vite v7 on macOS binds to ::1
		if ((await tryConnect(port, '::1')) || (await tryConnect(port, '127.0.0.1'))) {
			return
		}
		await new Promise((r) => setTimeout(r, 200))
	}
	throw new Error(`Timed out waiting for port ${port}`)
}

let devProc: ChildProcess
let tempConfigPath: string

async function assertPortFree(port: number): Promise<void> {
	if ((await tryConnect(port, '::1')) || (await tryConnect(port, '127.0.0.1'))) {
		throw new Error(
			`Port ${port} is already in use by another process. ` +
				`Kill it first: lsof -ti :${port} | xargs kill`,
		)
	}
}

test.beforeAll(async () => {
	// Fail fast if ports are occupied — otherwise seam dev silently picks
	// a different port and the test connects to the stale process.
	await Promise.all([assertPortFree(appPort), assertPortFree(vitePort)])

	tempConfigPath = path.join(appDir, `seam.e2e-${process.pid}-${Date.now().toString(36)}.config.ts`)
	writeFileSync(
		tempConfigPath,
		[
			"import { defineConfig } from '@canmi/seam'",
			"import base from './seam.config.ts'",
			'',
			'export default defineConfig({',
			'\t...base,',
			`\tbackend: { ...base.backend, port: ${appPort} },`,
			`\tdev: { ...base.dev, port: ${appPort}, vitePort: ${vitePort} },`,
			'})',
			'',
		].join('\n'),
	)

	devProc = spawn(seamBin, ['dev', '--config', tempConfigPath], {
		cwd: appDir,
		detached: true,
		stdio: 'pipe',
	})

	await Promise.all([waitForPort(vitePort), waitForPort(appPort)])
})

test.afterAll(async () => {
	if (devProc?.pid) {
		try {
			process.kill(-devProc.pid, 'SIGTERM')
		} catch {
			/* already exited */
		}
	}
	if (tempConfigPath) {
		rmSync(tempConfigPath, { force: true })
	}
})

test.describe('vite dev integration', () => {
	test('page serves Vite dev assets, not production output', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })
		// Use page.content() instead of response.text() — CDP may evict the
		// response body buffer on resource-constrained CI runners.
		const html = await page.content()

		// 1. Vite HMR client script present
		expect(html).toContain('/@vite/client')

		// 2. No production asset references
		expect(html).not.toMatch(/\/_seam\/static\/assets\//)

		// 3. No independent SSE reload (Vite HMR handles it)
		expect(html).not.toContain('/_seam/dev/reload')
	})
})
