/* src/server/core/typescript/__tests__/fixtures.ts */

import { createRouter, t } from '../src/index.js'
import type { SubscriptionDef, StreamDef, UploadDef } from '../src/index.js'

/** Canonical greet router used across adapter and handler tests */
export const greetRouter = createRouter({
	greet: {
		input: t.object({ name: t.string() }),
		output: t.object({ message: t.string() }),
		handler: ({ input }) => ({ message: `Hello, ${input.name}!` }),
	},
	updateName: {
		type: 'command',
		input: t.object({ name: t.string() }),
		output: t.object({ success: t.boolean() }),
		handler: () => ({ success: true }),
	},
	onCount: {
		type: 'subscription',
		input: t.object({ max: t.int32() }),
		output: t.object({ n: t.int32() }),
		handler: async function* ({ input }) {
			for (let i = 0; i < input.max; i++) yield { n: i }
		},
	} satisfies SubscriptionDef<{ max: number }, { n: number }>,
	countdown: {
		kind: 'stream',
		input: t.object({ max: t.int32() }),
		output: t.object({ n: t.int32() }),
		handler: async function* ({ input }) {
			for (let i = input.max; i >= 1; i--) yield { n: i }
		},
	} satisfies StreamDef<{ max: number }, { n: number }>,
	uploadFile: {
		kind: 'upload',
		input: t.object({ title: t.string() }),
		output: t.object({ title: t.string(), received: t.boolean() }),
		handler: ({ input }) => ({ title: input.title, received: true }),
	} satisfies UploadDef<{ title: string }, { title: string; received: boolean }>,
})

export const greetInput = { name: 'Alice' }
export const greetExpected = { message: 'Hello, Alice!' }

/** Raw schemas for low-level handler tests */
export const greetInputSchema = t.object({ name: t.string() })
export const greetOutputSchema = t.object({ message: t.string() })
