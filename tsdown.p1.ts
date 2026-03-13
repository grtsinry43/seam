/* tsdown.p1.ts */

import { defineConfig } from 'tsdown'

export default defineConfig({
	workspace: {
		include: [
			'src/server/injector/js',
			'src/server/injector/native',
			'src/server/engine/js',
			'src/client/vanilla',
			'src/cli/vite',
			'src/i18n',
			'src/router/seam',
			'src/query/seam',
			'src/eslint',
		],
	},
})
