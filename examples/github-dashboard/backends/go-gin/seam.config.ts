/* examples/github-dashboard/backends/go-gin/seam.config.ts */

import { defineConfig } from '@canmi/seam-cli/config'

export default defineConfig({
	project: { name: 'go-gin' },
	backend: { lang: 'go', devCommand: 'go run .', port: 3000 },
	build: {
		backendBuildCommand: 'go build -o server .',
		manifestCommand: './server --manifest',
	},
})
