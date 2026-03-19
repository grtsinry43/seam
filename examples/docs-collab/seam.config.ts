/* examples/docs-collab/seam.config.ts */

import { defineConfig } from '@canmi/seam'

export default defineConfig({
  output: 'hybrid',
  project: { name: 'docs-collab-demo' },
  backend: { lang: 'typescript' },
  frontend: { entry: 'src/client/main.tsx' },
  build: {
    backendBuildCommand: 'true',
    routerFile: 'src/server/router.ts',
    routes: './src/client/routes.ts',
    outDir: '.seam/output',
  },
})
