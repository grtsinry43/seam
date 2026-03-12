/* src/eslint/__tests__/no-derived-data-in-skeleton.test.ts */

import { RuleTester } from 'eslint'
import { afterAll, describe, it } from 'vitest'
import rule from '../src/rules/no-derived-data-in-skeleton.js'

RuleTester.afterAll = afterAll
RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
	languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
})

const PAGE = 'src/pages/home/page.tsx'

tester.run('no-derived-data-in-skeleton', rule, {
	valid: [
		{
			code: `
        const { title, show } = useSeamData();
        const body = show ? title : null;
      `,
			filename: PAGE,
		},
		{
			code: `
        const { items } = useSeamData();
        const rows = items.map((item) => item.name);
      `,
			filename: PAGE,
		},
		{
			code: `
        const price = Number(input);
      `,
			filename: 'src/components/home.tsx',
		},
	],
	invalid: [
		{
			code: `
        const { price } = useSeamData();
        const discount = price * 0.8;
      `,
			filename: PAGE,
			errors: [{ messageId: 'arithmetic' }],
		},
		{
			code: `
        const { price } = useSeamData();
        const expensive = price > 1000;
      `,
			filename: PAGE,
			errors: [{ messageId: 'numericComparison' }],
		},
		{
			code: `
        const { formattedPrice } = useSeamData();
        const label = formattedPrice.toUpperCase();
      `,
			filename: PAGE,
			errors: [{ messageId: 'formatMethod', data: { method: 'toUpperCase' } }],
		},
		{
			code: `
        const { watches } = useSeamData();
        const visible = watches.filter((watch) => watch.visible);
      `,
			filename: PAGE,
			errors: [{ messageId: 'arrayDerivation', data: { method: 'filter' } }],
		},
		{
			code: `
        const { createdAt } = useSeamData();
        const date = new Date(createdAt);
      `,
			filename: PAGE,
			errors: [{ messageId: 'dateConstruction' }],
		},
		{
			code: `
        const { watches } = useSeamData();
        const rows = watches.map((watch) => watch.price > 0 ? 'paid' : 'free');
      `,
			filename: PAGE,
			errors: [{ messageId: 'numericComparison' }],
		},
	],
})
