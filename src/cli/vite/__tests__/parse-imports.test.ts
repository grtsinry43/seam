/* src/cli/vite/__tests__/parse-imports.test.ts */

import { describe, it, expect } from 'vitest'
import { parseComponentImports } from '../src/index.js'

describe('parseComponentImports', () => {
	it('parses default import', () => {
		const result = parseComponentImports('import Home from "./Home"')
		expect(result).toEqual(new Map([['Home', './Home']]))
	})

	it('parses named import', () => {
		const result = parseComponentImports('import { Dashboard } from "./pages"')
		expect(result).toEqual(new Map([['Dashboard', './pages']]))
	})

	it('parses renamed import', () => {
		const result = parseComponentImports('import { Dash as Dashboard } from "./D"')
		expect(result).toEqual(new Map([['Dashboard', './D']]))
	})

	it('parses mixed default + named import', () => {
		const result = parseComponentImports('import App, { Sidebar } from "./app"')
		expect(result).toEqual(
			new Map([
				['App', './app'],
				['Sidebar', './app'],
			]),
		)
	})

	it('returns empty map when no imports', () => {
		const result = parseComponentImports('const x = 1;')
		expect(result).toEqual(new Map())
	})

	it('skips dynamic import', () => {
		const result = parseComponentImports('() => import("./X")')
		expect(result).toEqual(new Map())
	})

	it('skips namespace import', () => {
		const result = parseComponentImports('import * as Foo from "./foo"')
		expect(result).toEqual(new Map())
	})

	it('skips side-effect import', () => {
		const result = parseComponentImports('import "./styles.css"')
		expect(result).toEqual(new Map())
	})

	it('handles multiple imports', () => {
		const code = [
			'import Home from "./Home"',
			'import About from "./About"',
			'import Contact from "./Contact"',
		].join('\n')
		const result = parseComponentImports(code)
		expect(result).toEqual(
			new Map([
				['Home', './Home'],
				['About', './About'],
				['Contact', './Contact'],
			]),
		)
	})

	it('handles multiline import', () => {
		const code = 'import\n  Home\n  from "./Home"'
		const result = parseComponentImports(code)
		expect(result).toEqual(new Map([['Home', './Home']]))
	})
})
