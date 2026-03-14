/* src/cli/pkg/scripts/vite-cache.mjs */

import { createHash } from 'node:crypto'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

const LOCKFILES = ['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']

function readTextOrBinary(path) {
	return readFileSync(path)
}

function collectYalcInputs(projectRoot) {
	const inputs = []
	const yalcLock = join(projectRoot, '.yalc.lock')
	if (existsSync(yalcLock)) inputs.push(yalcLock)

	const yalcDir = join(projectRoot, '.yalc')
	if (!existsSync(yalcDir)) return inputs

	for (const entry of readdirSync(yalcDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue
		const pkgJson = join(yalcDir, entry.name, 'package.json')
		if (existsSync(pkgJson)) inputs.push(pkgJson)
	}

	return inputs
}

export function collectFingerprintInputs(projectRoot = process.cwd()) {
	const inputs = [join(projectRoot, 'package.json')]
	for (const lockfile of LOCKFILES) {
		const path = join(projectRoot, lockfile)
		if (existsSync(path)) inputs.push(path)
	}
	return [...inputs, ...collectYalcInputs(projectRoot)]
}

export function computeViteCacheFingerprint(projectRoot = process.cwd()) {
	const hash = createHash('sha256')
	for (const path of collectFingerprintInputs(projectRoot).sort()) {
		hash.update(path)
		hash.update(readTextOrBinary(path))
	}
	return hash.digest('hex').slice(0, 16)
}

function markerFileName(pid, fingerprint) {
	return `${pid}-${fingerprint}.json`
}

function pidIsAlive(pid) {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return error?.code === 'EPERM'
	}
}

export function pruneDeadCacheRefs(refsDir) {
	if (!existsSync(refsDir)) return
	for (const entry of readdirSync(refsDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.json')) continue
		const path = join(refsDir, entry.name)
		try {
			const ref = JSON.parse(readFileSync(path, 'utf-8'))
			if (!pidIsAlive(ref.pid)) unlinkSync(path)
		} catch {
			unlinkSync(path)
		}
	}
}

function readLiveFingerprints(refsDir) {
	const fingerprints = new Set()
	if (!existsSync(refsDir)) return fingerprints
	for (const entry of readdirSync(refsDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.json')) continue
		try {
			const ref = JSON.parse(readFileSync(join(refsDir, entry.name), 'utf-8'))
			if (ref?.fingerprint) fingerprints.add(ref.fingerprint)
		} catch {
			// stale markers are cleaned separately
		}
	}
	return fingerprints
}

export function gcViteCache(cacheRoot, preserveFingerprints = []) {
	const fingerprintsDir = join(cacheRoot, 'fingerprints')
	const refsDir = join(cacheRoot, 'refs')
	pruneDeadCacheRefs(refsDir)

	const liveFingerprints = readLiveFingerprints(refsDir)
	for (const fingerprint of preserveFingerprints) {
		liveFingerprints.add(fingerprint)
	}

	if (!existsSync(fingerprintsDir)) return
	for (const entry of readdirSync(fingerprintsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue
		if (liveFingerprints.has(entry.name)) continue
		rmSync(join(fingerprintsDir, entry.name), { recursive: true, force: true })
	}
}

export function prepareViteCache({
	projectRoot = process.cwd(),
	devOutDir = process.env.SEAM_DEV_OUT_DIR ?? '.seam/dev-output',
} = {}) {
	const fingerprint = computeViteCacheFingerprint(projectRoot)
	const cacheRoot = resolve(projectRoot, devOutDir, 'vite-cache')
	const refsDir = join(cacheRoot, 'refs')
	const fingerprintsDir = join(cacheRoot, 'fingerprints')
	const cacheDir = join(fingerprintsDir, fingerprint)
	const markerPath = join(refsDir, markerFileName(process.pid, fingerprint))

	mkdirSync(refsDir, { recursive: true })
	mkdirSync(cacheDir, { recursive: true })
	pruneDeadCacheRefs(refsDir)
	writeFileSync(markerPath, JSON.stringify({ pid: process.pid, fingerprint }), 'utf-8')
	gcViteCache(cacheRoot, [fingerprint])

	return { cacheDir, cacheRoot, fingerprint, markerPath }
}

export function releaseViteCache(context) {
	try {
		unlinkSync(context.markerPath)
	} catch {
		// marker already removed
	}
	gcViteCache(context.cacheRoot, [context.fingerprint])
}
