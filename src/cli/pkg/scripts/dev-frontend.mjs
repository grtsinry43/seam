/* src/cli/pkg/scripts/dev-frontend.mjs */

// Seam programmatic Vite dev server.
// Usage: node|bun dev-frontend.mjs <port>

import { createServer, mergeConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { seam } from '@canmi/seam-vite'

const port = Number(process.argv[2])
if (!port) {
	console.error('usage: dev-frontend.mjs <port>')
	process.exit(1)
}

// Load user config from seam.config.ts via SEAM_CONFIG_PATH
let userConfig = {}
if (process.env.SEAM_CONFIG_PATH) {
	try {
		const mod = await import(process.env.SEAM_CONFIG_PATH)
		const raw = mod.default ?? mod
		userConfig = raw.vite ?? {}
	} catch {
		// config import failed — proceed with defaults
	}
}

// Extract user plugins before merging
const userPlugins = userConfig.plugins ?? []
const { plugins: _, build: __, ...userRest } = userConfig

const seamBase = {
	configFile: false,
	plugins: [react(), seam(), ...userPlugins],
	resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'] },
	server: { port, strictPort: true },
}

const server = await createServer(mergeConfig(seamBase, userRest))
await server.listen()
server.printUrls()
