import { HoudiniClient } from '$houdini/runtime/client'
import { subscription } from '$houdini/plugins'
import { createClient } from 'graphql-ws'

export default new HoudiniClient({
	fetchParams({ session }) {
		if (!session?.user?.token) {
			return {}
		}

		return {
			headers: {
				Authorization: `Bearer ${session.user.token}`,
			},
		}
	},
	plugins: [
		subscription(() =>
			createClient({
				url: 'ws://localhost:4000/graphql',
			})
		),
	],
})
