/* tsdown.p3.ts */

import { defineConfig } from 'tsdown'

export default defineConfig({
	workspace: {
		include: [
			'src/server/adapter/hono',
			'src/server/adapter/bun',
			'src/server/adapter/node',
			'src/router/tanstack',
		],
	},
})
