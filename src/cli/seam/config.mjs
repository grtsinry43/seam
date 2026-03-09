/* src/cli/seam/config.mjs */

/** @param {import('./config').SeamConfig} config */
export function defineConfig(config) {
	if (config.build?.bundlerCommand !== undefined || config.frontend?.buildCommand !== undefined) {
		throw new Error(
			'bundlerCommand / frontend.buildCommand have been removed — use frontend.entry with the built-in bundler instead',
		)
	}

	if (config.build?.routes && config.build?.pagesDir) {
		throw new Error('build.routes and build.pagesDir are mutually exclusive')
	}

	if (
		config.build?.hashLength !== undefined &&
		(config.build.hashLength < 4 || config.build.hashLength > 64)
	) {
		throw new Error(`hash_length must be between 4 and 64 (got ${config.build.hashLength})`)
	}
	if (
		config.dev?.hashLength !== undefined &&
		(config.dev.hashLength < 4 || config.dev.hashLength > 64)
	) {
		throw new Error(`hash_length must be between 4 and 64 (got ${config.dev.hashLength})`)
	}

	if (config.i18n) {
		if (!Array.isArray(config.i18n.locales) || config.i18n.locales.length === 0) {
			throw new Error('i18n.locales must not be empty')
		}
		if (config.i18n.default !== undefined && !config.i18n.locales.includes(config.i18n.default)) {
			throw new Error(`i18n.default "${config.i18n.default}" is not in i18n.locales`)
		}
	}

	if (config.build?.renderer !== undefined && config.build.renderer !== 'react') {
		throw new Error(`build.renderer must be 'react', got '${config.build.renderer}'`)
	}

	return config
}
