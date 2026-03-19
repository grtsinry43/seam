/* examples/docs-collab/src/client/routes.ts */

import { defineSeamRoutes } from '@canmi/seam-tanstack-router/routes'
import { DocsLayout } from './pages/layout.js'
import { DocsHomePage } from './pages/home-page.js'
import { AdminPage } from './pages/admin-page.js'

export default defineSeamRoutes([
  {
    path: '/',
    layout: DocsLayout,
    loaders: {
      docs: { procedure: 'listDocs' },
    },
    mock: {
      docs: {
        docs: [
          {
            slug: 'getting-started',
            title: 'Getting started with Seam Docs',
            updatedAt: new Date().toISOString(),
            version: 1,
          },
        ],
      },
    },
    children: [
      {
        path: '/',
        component: DocsHomePage,
        prerender: true,
        data: {
          docs: {
            docs: [
              {
                slug: 'getting-started',
                title: 'Getting started with Seam Docs',
                updatedAt: new Date().toISOString(),
                version: 1,
              },
            ],
          },
        },
        loaders: {
          doc: { procedure: 'getDoc', params: { slug: { from: 'query' } } },
        },
        mock: {
          doc: {
            slug: 'getting-started',
            title: 'Getting started with Seam Docs',
            blocks: [
              { id: 'm1', type: 'heading', text: 'Seam Docs Demo' },
              { id: 'm2', type: 'paragraph', text: 'Static by default, collaborative after hydration.' },
            ],
            updatedAt: new Date().toISOString(),
            updatedBy: 'Administrator',
            version: 1,
          },
        },
        head: { title: 'Seam Docs — Static-first docs site' },
      },
      {
        path: '/admin',
        component: AdminPage,
        loaders: {
          docs: { procedure: 'listDocs' },
          members: { procedure: 'adminListMembers', params: { actorId: { from: 'query' } } },
        },
        mock: {
          docs: { docs: [] },
          members: { members: [] },
        },
        head: { title: 'Seam Docs Admin' },
      },
    ],
  },
])
