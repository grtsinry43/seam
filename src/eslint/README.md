# @canmi/eslint-plugin-seam

ESLint rules that enforce build-time safety constraints for SeamJS filesystem-router page components (`page.tsx`).

## Rules

| Rule                              | Description                                                                                         | Status |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| `no-browser-apis-in-skeleton`     | Disallow browser-only APIs (window, document, localStorage, etc.)                                   | Error  |
| `no-async-in-skeleton`            | Disallow async operations (async/await, Promises, fetch, setTimeout)                                | Error  |
| `no-nondeterministic-in-skeleton` | Disallow non-deterministic expressions (Date.now, Math.random, crypto)                              | Error  |
| `no-derived-data-in-skeleton`     | Disallow render-time derived computations from seam data (arithmetic, array derivation, formatting) | Error  |
| `no-effect-in-skeleton`           | Warn against useEffect/useLayoutEffect (no-op during build-time renderToString)                     | Warn   |

## Usage

Add the recommended config to your ESLint flat config:

```js
import seamPlugin from '@canmi/eslint-plugin-seam'

export default [
	...seamPlugin.configs.recommended,
	// your other configs...
]
```

The recommended config scopes all rules to `page.tsx` files as `"error"`.

## Development

- Build: `just build-ts`
- Test: `just test-ts`
