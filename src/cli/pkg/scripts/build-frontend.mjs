/* src/cli/pkg/scripts/build-frontend.mjs */

// Seam built-in frontend bundler powered by Vite.
// Usage: node|bun build-frontend.mjs <entry> <outdir>

import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { seam } from '@canmi/seam-vite'

const [entry, outDir = '.seam/dist'] = process.argv.slice(2)
if (!entry) {
	console.error('usage: build-frontend.mjs <entry> <outdir>')
	process.exit(1)
}

// Set SEAM_ENTRY so seam() config plugin can inject it as rollupOptions.input
process.env.SEAM_ENTRY = entry
if (!process.env.SEAM_DIST_DIR) process.env.SEAM_DIST_DIR = outDir

// User config overrides from seam.config.ts [vite] section
const userConfig = process.env.SEAM_VITE_CONFIG ? JSON.parse(process.env.SEAM_VITE_CONFIG) : {}

await build({
	configFile: false,
	plugins: [react(), seam(), ...(userConfig.plugins ?? [])],
	resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'], ...userConfig.resolve },
	...(userConfig.css ? { css: userConfig.css } : {}),
	...(userConfig.define ? { define: userConfig.define } : {}),
})
