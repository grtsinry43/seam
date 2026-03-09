/* examples/markdown-demo/server-ts/seam.config.ts */

import { defineConfig } from '@canmi/seam'

export default defineConfig({
	project: { name: 'markdown-demo-ts' },
	backend: { lang: 'typescript', devCommand: 'bun --watch src/index.ts', port: 3000 },
})
