/* examples/i18n-demo/seam-app/src/client/main.tsx */

import { createSeamApp } from '@canmi/seam-tanstack-router'
import { SeamI18nBridge } from '@canmi/seam-tanstack-router/i18n'
import routes from './routes.js'

createSeamApp({ routes, i18nBridge: SeamI18nBridge, cleanLocaleQuery: true })
