/* examples/i18n-demo/seam-app/vite.config.ts */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { seam } from '@canmi/seam-vite'

export default defineConfig({
	plugins: [react(), seam()],
})
