/* examples/github-dashboard/seam-app/src/server/index.ts */

import { resolve } from 'node:path'
import { Hono } from 'hono'
import { loadBuild, loadBuildDev } from '@canmi/seam-server'
import { seam } from '@canmi/seam-adapter-hono'
import { buildRouter } from './router.js'

const isDev = process.env.SEAM_DEV === '1'
const outputDir = process.env.SEAM_OUTPUT_DIR
if (isDev && !outputDir) throw new Error('SEAM_OUTPUT_DIR is required in dev mode')
const BUILD_DIR = isDev ? (outputDir as string) : resolve(import.meta.dir, '..')
const build = isDev ? loadBuildDev(BUILD_DIR) : loadBuild(BUILD_DIR)
const dataId = Object.values(build.pages)[0]?.dataId ?? '__data'
const router = buildRouter(build)

const app = new Hono()

// Seam middleware: handles /_seam/* (RPC, manifest, static, pages, dev reload)
app.use('/*', seam(router, { staticDir: resolve(BUILD_DIR, 'public') }))

// Root-path page serving — inject timing into data script's _meta
app.get('*', async (c) => {
	const result = await router.handlePage(new URL(c.req.url).pathname)
	if (!result) return c.text('Not Found', 404)

	const { dataFetch = 0, inject: injectTime = 0 } = result.timing ?? {}
	const fmt = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(0)}\u00b5s` : `${ms.toFixed(2)}ms`)
	const timing = `\u00a0\u00b7 Data Fetch ${fmt(dataFetch)} \u00b7 Inject ${fmt(injectTime)}`

	let html = result.html.replace('<body>', '<body style="background-color:var(--c-surface)">')

	// Append _meta.timing into the data script JSON
	const dataIdPattern = new RegExp(`<script id="${dataId}" type="application/json">(.*?)</script>`)
	html = html.replace(dataIdPattern, (_match, json) => {
		const data = JSON.parse(json)
		data._meta = { timing }
		return `<script id="${dataId}" type="application/json">${JSON.stringify(data)}</script>`
	})
	return c.html(html, result.status as 200)
})

const port = Number(process.env.PORT) || 3000

Bun.serve({ port, fetch: app.fetch })

console.log(`GitHub Dashboard running on http://localhost:${port}`)
