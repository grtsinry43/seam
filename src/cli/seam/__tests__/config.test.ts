/* src/cli/seam/__tests__/config.test.ts */

import { describe, it, expect } from 'vitest'
import type { SeamConfig } from '../config.js'
import { defineConfig } from '../config.mjs'

// Deprecated fields removed from types but still need runtime validation testing
const withDeprecated = (obj: Record<string, unknown>) => obj as unknown as SeamConfig

describe('defineConfig', () => {
	it('passes through a valid config unchanged', () => {
		const cfg = { build: { routes: './routes.ts', renderer: 'react' as const } }
		expect(defineConfig(cfg)).toBe(cfg)
	})

	it('passes through an empty config', () => {
		const cfg = {}
		expect(defineConfig(cfg)).toBe(cfg)
	})

	it('passes through config without optional sections', () => {
		const cfg = { project: { name: 'test' } }
		expect(defineConfig(cfg)).toBe(cfg)
	})

	// Deprecated fields

	it('throws on build.bundlerCommand', () => {
		expect(() => defineConfig(withDeprecated({ build: { bundlerCommand: 'vite build' } }))).toThrow(
			'bundlerCommand',
		)
	})

	it('throws on frontend.buildCommand', () => {
		expect(() =>
			defineConfig(withDeprecated({ frontend: { buildCommand: 'vite build' } })),
		).toThrow('buildCommand')
	})

	// Mutual exclusion

	it('throws when both build.routes and build.pagesDir are set', () => {
		expect(() => defineConfig({ build: { routes: './routes.ts', pagesDir: 'src/pages' } })).toThrow(
			'mutually exclusive',
		)
	})

	it('allows build.routes without pagesDir', () => {
		expect(() => defineConfig({ build: { routes: './routes.ts' } })).not.toThrow()
	})

	it('allows build.pagesDir without routes', () => {
		expect(() => defineConfig({ build: { pagesDir: 'src/pages' } })).not.toThrow()
	})

	// hashLength range

	it('throws when build.hashLength < 4', () => {
		expect(() => defineConfig({ build: { hashLength: 3 } })).toThrow('hash_length')
	})

	it('throws when build.hashLength > 64', () => {
		expect(() => defineConfig({ build: { hashLength: 65 } })).toThrow('hash_length')
	})

	it('allows build.hashLength = 4 (lower bound)', () => {
		expect(() => defineConfig({ build: { hashLength: 4 } })).not.toThrow()
	})

	it('allows build.hashLength = 64 (upper bound)', () => {
		expect(() => defineConfig({ build: { hashLength: 64 } })).not.toThrow()
	})

	it('throws when dev.hashLength is out of range', () => {
		expect(() => defineConfig({ dev: { hashLength: 2 } })).toThrow('hash_length')
	})

	// i18n validation

	it('throws when i18n.locales is empty', () => {
		expect(() => defineConfig({ i18n: { locales: [] } })).toThrow('i18n.locales must not be empty')
	})

	it('throws when i18n.default is not in locales', () => {
		expect(() => defineConfig({ i18n: { locales: ['en', 'zh'], default: 'fr' } })).toThrow(
			'i18n.default "fr" is not in i18n.locales',
		)
	})

	it('allows i18n.default that is in locales', () => {
		expect(() => defineConfig({ i18n: { locales: ['en', 'zh'], default: 'zh' } })).not.toThrow()
	})

	it('allows i18n without default (first locale is used)', () => {
		expect(() => defineConfig({ i18n: { locales: ['en'] } })).not.toThrow()
	})

	// renderer literal

	it('throws on invalid build.renderer', () => {
		expect(() => defineConfig(withDeprecated({ build: { renderer: 'vue' } }))).toThrow(
			"build.renderer must be 'react'",
		)
	})

	it('allows build.renderer = react', () => {
		expect(() => defineConfig({ build: { renderer: 'react' } })).not.toThrow()
	})
})
