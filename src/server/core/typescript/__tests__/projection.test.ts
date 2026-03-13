/* src/server/core/typescript/__tests__/projection.test.ts */

import { describe, expect, it } from 'vitest'
import { applyProjection } from '../src/page/projection.js'

describe('applyProjection: prototype pollution resistance', () => {
	it('blocks __proto__ in field path', () => {
		const data = { loader: { __proto__: { polluted: true }, safe: 1 } }
		const result = applyProjection(data, { loader: ['__proto__'] })
		expect(result.loader).toEqual({})
	})

	it('blocks prototype in field path', () => {
		const data = { loader: { prototype: { polluted: true }, safe: 1 } }
		const result = applyProjection(data, { loader: ['prototype'] })
		expect(result.loader).toEqual({})
	})

	it('blocks constructor in field path', () => {
		const data = { loader: { constructor: { polluted: true }, safe: 1 } }
		const result = applyProjection(data, { loader: ['constructor'] })
		expect(result.loader).toEqual({})
	})

	it('blocks nested __proto__ in dot path', () => {
		const data = { loader: { a: { __proto__: { polluted: true } } } }
		const result = applyProjection(data, { loader: ['a.__proto__.polluted'] })
		// setNestedField creates intermediate 'a' before hitting __proto__ guard
		expect(result.loader).toEqual({ a: {} })
		expect(Object.prototype).not.toHaveProperty('polluted')
	})

	it('blocks array element __proto__ pollution', () => {
		const data = { loader: [{ __proto__: { polluted: true }, id: 1 }] }
		const result = applyProjection(data, { loader: ['$.__proto__'] })
		expect(result.loader).toEqual([{}])
	})
})

describe('applyProjection: sanity', () => {
	it('keeps correct fields with projection', () => {
		const data = { loader: { name: 'Alice', age: 30, secret: 'x' } }
		const result = applyProjection(data, { loader: ['name', 'age'] })
		expect(result.loader).toEqual({ name: 'Alice', age: 30 })
	})

	it('passes through when projection is undefined', () => {
		const data = { loader: { name: 'Alice' } }
		const result = applyProjection(data, undefined)
		expect(result).toBe(data)
	})
})
