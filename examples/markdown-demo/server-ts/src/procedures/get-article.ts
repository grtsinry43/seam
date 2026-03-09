/* examples/markdown-demo/server-ts/src/procedures/get-article.ts */

import { t } from '@canmi/seam-server'
import type { QueryDef } from '@canmi/seam-server'
import { marked } from 'marked'

const MARKDOWN_SOURCE = `
**Bold text** and *italic text* with ~~strikethrough~~.

A [link to Seam](https://github.com/canmi21/seam) for reference.

> Markdown rendered as raw HTML via the \`:html\` template slot —
> no escaping, no sanitization overhead.

---

\`\`\`typescript
import { t } from '@canmi/seam-server'
import { marked } from 'marked'

// t.html() marks the output as raw HTML in the manifest
const output = t.object({
  title: t.string(),
  contentHtml: t.html(),
})

const html = marked.parse(source, { async: false })
\`\`\`

Inline \`code\` also works.
`

interface GetArticleOutput {
	title: string
	contentHtml: string
}

export const getArticle: QueryDef<Record<string, never>, GetArticleOutput> = {
	input: t.object({}),
	output: t.object({ title: t.string(), contentHtml: t.html() }),
	handler: () => {
		const contentHtml = marked.parse(MARKDOWN_SOURCE, { async: false }) as string
		return { title: 'Markdown Demo (TypeScript + marked)', contentHtml }
	},
}
