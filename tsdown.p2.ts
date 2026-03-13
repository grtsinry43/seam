/* tsdown.p2.ts */

import { defineConfig } from 'tsdown'

export default defineConfig({
	workspace: {
		include: ['src/server/core/typescript', 'src/client/react', 'src/query/react'],
	},
})
