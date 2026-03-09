# @canmi/seam

Lightweight config package — exports `defineConfig` helper and `SeamConfig` types for `seam.config.ts`.

## Structure

- `config.mjs` — `defineConfig` identity function (returns config as-is)
- `config.d.ts` — `SeamConfig` and all section interfaces

## Key Points

- Peer dependency on `vite` (for `ViteUserConfig` type in the `vite` config field)
- Extracted from `@canmi/seam-cli/config` so projects can depend on config types without pulling in the full CLI toolchain
- Published in npm layer 1 (before `@canmi/seam-cli` which depends on it)
- No build step — ships raw `.mjs` and `.d.ts`
