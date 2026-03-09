/* examples/markdown-demo/server-rust/seam.config.ts */

import { defineConfig } from '@canmi/seam'

export default defineConfig({
	project: { name: 'markdown-demo-rust' },
	backend: { lang: 'rust', devCommand: 'cargo watch -x run', port: 3000 },
})
