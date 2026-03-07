/* examples/features/query-mutation/src/pages/layout.tsx */

import type { ReactNode } from 'react'
import { SeamQueryProvider } from '@canmi/seam-query-react'
import { seamRpc } from '@canmi/seam-client'
import { seamProcedureConfig } from 'virtual:seam/client'

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<SeamQueryProvider rpcFn={seamRpc} config={seamProcedureConfig}>
			{children}
		</SeamQueryProvider>
	)
}
