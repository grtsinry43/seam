/* examples/github-dashboard/frontend/vite.config.ts */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { seam } from '@canmi/seam-vite'

export default defineConfig({
	plugins: [react(), seam({ devOutDir: '../.seam/dev-output' })],
	server: { origin: 'http://localhost:5173' },
})
