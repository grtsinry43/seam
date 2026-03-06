/* examples/standalone/server-rust/seam.config.ts */

import { defineConfig } from '@canmi/seam-cli/config'

export default defineConfig({
	project: { name: 'server-rust-example' },
	backend: { lang: 'rust', devCommand: 'cargo watch -x run', port: 3000 },
})
