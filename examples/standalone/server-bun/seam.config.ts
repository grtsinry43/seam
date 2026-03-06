/* examples/standalone/server-bun/seam.config.ts */

import { defineConfig } from '@canmi/seam-cli/config'

export default defineConfig({
	project: { name: 'server-bun-example' },
	backend: { lang: 'typescript', devCommand: 'bun --watch src/index.ts', port: 3000 },
})
