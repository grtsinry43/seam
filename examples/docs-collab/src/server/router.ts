/* examples/docs-collab/src/server/router.ts */

import { createRouter } from '@canmi/seam-server'
import type { RouterOptions } from '@canmi/seam-server'
import {
  listDocs,
  getDoc,
  adminListMembers,
  createInvite,
  acceptInvite,
  createDoc,
  saveDoc,
  presencePing,
  onDocEvent,
} from './procedures.js'

export const procedures = {
  listDocs,
  getDoc,
  adminListMembers,
  createInvite,
  acceptInvite,
  createDoc,
  saveDoc,
  presencePing,
  onDocEvent,
}

export function buildRouter(opts?: RouterOptions) {
  return createRouter(procedures, opts)
}

export const router = buildRouter()
