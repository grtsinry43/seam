/* src/eslint/__tests__/no-nondeterministic-in-skeleton.test.ts */

import { RuleTester } from 'eslint'
import { afterAll, describe, it } from 'vitest'
import rule from '../src/rules/no-nondeterministic-in-skeleton.js'

RuleTester.afterAll = afterAll
RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
	languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
})

const PAGE = 'src/pages/home/page.tsx'

tester.run('no-nondeterministic-in-skeleton', rule, {
	valid: [
		// deterministic math in page component — allowed
		{ code: 'const x = Math.floor(1.5);', filename: PAGE },
		// Math.random in non-page file — not checked
		{ code: 'const r = Math.random();', filename: 'src/components/home.tsx' },
	],
	invalid: [
		// Math.random()
		{
			code: 'const r = Math.random();',
			filename: PAGE,
			errors: [{ messageId: 'mathRandom' }],
		},
		// Date.now()
		{
			code: 'const t = Date.now();',
			filename: PAGE,
			errors: [{ messageId: 'dateNow' }],
		},
		// new Date()
		{
			code: 'const d = new Date();',
			filename: PAGE,
			errors: [{ messageId: 'dateNow' }],
		},
		// crypto.randomUUID()
		{
			code: 'const id = crypto.randomUUID();',
			filename: PAGE,
			errors: [{ messageId: 'cryptoRandom' }],
		},
		// crypto.getRandomValues()
		{
			code: 'const buf = crypto.getRandomValues(new Uint8Array(16));',
			filename: PAGE,
			errors: [{ messageId: 'cryptoRandom' }],
		},
	],
})
