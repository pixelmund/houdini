import { setSession } from '$houdini'
import type { Handle } from '@sveltejs/kit/hooks'

export const handle: Handle = async ({ event, resolve }) => {
	setSession(event, {
		user: { token: event.cookies.get('houdini-session-token') ?? '1234-Houdini-Token-5678' },
	})

	return await resolve(event)
}
