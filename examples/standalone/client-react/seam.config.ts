/* examples/standalone/client-react/seam.config.ts */

import { defineConfig } from '@canmi/seam-cli/config'

export default defineConfig({
	project: { name: 'client-react-example' },
	build: {
		routes: './src/routes.ts',
		outDir: '.seam/output',
		bundlerCommand: 'npx vite build',
		bundlerManifest: '.seam/dist/.vite/manifest.json',
		renderer: 'react',
	},
})
