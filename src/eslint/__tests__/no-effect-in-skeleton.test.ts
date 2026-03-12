/* src/eslint/__tests__/no-effect-in-skeleton.test.ts */

import { RuleTester } from 'eslint'
import { afterAll, describe, it } from 'vitest'
import rule from '../src/rules/no-effect-in-skeleton.js'

RuleTester.afterAll = afterAll
RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
	languageOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
})

const PAGE = 'src/pages/home/page.tsx'

tester.run('no-effect-in-skeleton', rule, {
	valid: [
		// useEffect in non-page file — not checked
		{ code: 'useEffect(() => {}, []);', filename: 'src/components/home.tsx' },
		// useState (not an effect hook) in page component — allowed
		{ code: 'const [x, setX] = useState(0);', filename: PAGE },
	],
	invalid: [
		// useEffect in skeleton
		{
			code: "useEffect(() => { console.log('mounted'); }, []);",
			filename: PAGE,
			errors: [{ messageId: 'noEffect' }],
		},
		// useLayoutEffect in skeleton
		{
			code: "useLayoutEffect(() => { document.title = 'x'; }, []);",
			filename: PAGE,
			errors: [{ messageId: 'noEffect' }],
		},
	],
})
