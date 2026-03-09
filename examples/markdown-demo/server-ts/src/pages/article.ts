/* examples/markdown-demo/server-ts/src/pages/article.ts */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { definePage } from '@canmi/seam-server'

const template = readFileSync(
	resolve(import.meta.dirname, '../../../templates/article.html'),
	'utf-8',
)

export const articlePage = definePage({
	template,
	loaders: {
		article: () => ({ procedure: 'getArticle', input: {} }),
	},
})
