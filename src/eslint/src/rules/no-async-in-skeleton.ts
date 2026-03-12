/* src/eslint/src/rules/no-async-in-skeleton.ts */

import type { Rule } from 'eslint'

const PAGE_COMPONENT_PATTERN = /(?:^|[\\/])page\.tsx$/

const rule: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow async operations (use(), async components, Suspense) in page components rendered at build time',
		},
		schema: [],
		messages: {
			noUse:
				'use() is not allowed in skeleton components.\n' +
				"  Safe: use(thenable with status:'fulfilled') works at build time,\n" +
				'        but static analysis cannot verify this.\n' +
				'  Risk: use(Promise.resolve()) silently suspends and corrupts the template.\n' +
				'  Fix:  Move data fetching to a loader. Use useSeamData() to consume it.',
			noAsyncComponent:
				'Async components are not allowed in skeleton files. Skeleton components must render synchronously.',
			noSuspense:
				'Suspense boundaries in skeleton components may produce abort markers (<!--$!-->) that corrupt CTR templates.',
		},
	},
	create(context) {
		if (!PAGE_COMPONENT_PATTERN.test(context.filename)) return {}

		return {
			// use(somePromise)
			CallExpression(node) {
				if (node.callee.type === 'Identifier' && node.callee.name === 'use') {
					context.report({ node, messageId: 'noUse' })
				}
			},

			// async function HomeSkeleton() { ... }
			FunctionDeclaration(node) {
				if (node.async) {
					context.report({ node, messageId: 'noAsyncComponent' })
				}
			},

			// const HomeSkeleton = async () => { ... }
			ArrowFunctionExpression(node) {
				if (node.async) {
					context.report({ node, messageId: 'noAsyncComponent' })
				}
			},

			// const HomeSkeleton = async function() { ... }
			FunctionExpression(node) {
				if (node.async) {
					context.report({ node, messageId: 'noAsyncComponent' })
				}
			},

			// <Suspense fallback={...}>...</Suspense>
			JSXOpeningElement(node: Rule.Node) {
				const jsx = node as unknown as { name: { type: string; name: string } }
				if (jsx.name.type === 'JSXIdentifier' && jsx.name.name === 'Suspense') {
					context.report({ node, messageId: 'noSuspense' })
				}
			},
		}
	},
}

export default rule
