/* examples/github-dashboard/frontend/src/client/main.tsx */

import './index.css'
import { createSeamApp } from '@canmi/seam-tanstack-router'
import routes from './routes.js'

createSeamApp({ routes })
