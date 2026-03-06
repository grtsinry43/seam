/* examples/features/channel-subscription/src/server/channels/echo.ts */

import { EventEmitter } from 'node:events'
import { t, createChannel, fromCallback } from '@canmi/seam-server'

const rooms = new Map<string, EventEmitter>()

function getRoom(roomId: string): EventEmitter {
	let room = rooms.get(roomId)
	if (!room) {
		room = new EventEmitter()
		rooms.set(roomId, room)
	}
	return room
}

interface EchoEvent {
	type: 'message'
	payload: { id: string; text: string }
}

let nextId = 1

export const echo = createChannel('echo', {
	input: t.object({ roomId: t.string() }),

	incoming: {
		send: {
			input: t.object({ text: t.string() }),
			output: t.object({ id: t.string() }),
			handler: ({ input }) => {
				const { roomId, text } = input as { roomId: string; text: string }
				const id = String(nextId++)
				const room = getRoom(roomId)
				room.emit('event', {
					type: 'message',
					payload: { id, text },
				} satisfies EchoEvent)
				return { id }
			},
		},
	},

	outgoing: {
		message: t.object({
			id: t.string(),
			text: t.string(),
		}),
	},

	subscribe: ({ input }) => {
		const room = getRoom(input.roomId)
		return fromCallback<EchoEvent>(({ emit }) => {
			const handler = (event: EchoEvent) => emit(event)
			room.on('event', handler)
			return () => room.off('event', handler)
		})
	},
})
