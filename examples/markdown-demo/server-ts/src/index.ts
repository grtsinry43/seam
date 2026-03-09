/* examples/markdown-demo/server-ts/src/index.ts */

import { createRouter } from '@canmi/seam-server'
import { serveBun } from '@canmi/seam-adapter-bun'

import { getArticle } from './procedures/get-article.js'
import { articlePage } from './pages/article.js'

const router = createRouter({ getArticle }, { pages: { '/': articlePage } })
const port = process.env.PORT !== undefined ? Number(process.env.PORT) : 3000
const server = serveBun(router, { port })

console.log(`Markdown demo (TS) running on http://localhost:${server.port}`)
