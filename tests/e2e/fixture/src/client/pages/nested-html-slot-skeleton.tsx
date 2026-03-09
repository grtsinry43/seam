/* tests/e2e/fixture/src/client/pages/nested-html-slot-skeleton.tsx */

import { useSeamData } from '@canmi/seam-react'

interface NestedHtmlSlotData extends Record<string, unknown> {
	post: {
		title: string
		body: string
	}
}

export function NestedHtmlSlotSkeleton() {
	const data = useSeamData<NestedHtmlSlotData>('page')

	return (
		<div>
			<h1 data-testid="title">{data.post.title}</h1>
			<article data-testid="body" dangerouslySetInnerHTML={{ __html: data.post.body }} />
			<a href="/" data-testid="link-home">
				Back to Home
			</a>
		</div>
	)
}
