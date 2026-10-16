<script lang="ts">
	import { page } from '$app/state'
	import { graphql } from '$houdini'
	import Hydrated from '#lib/Hydrated.svelte'
	import UserAvatar from './UserAvatar.svelte'

	const UserProfile = graphql(`
		query AsyncUserProfile($id: ID!) {
			user(id: $id, snapshot: "async-user") {
				id
				name
				...AsyncUserAvatar
			}
		}
	`)

	// the route parameter is read synchronously inside of the derived, so navigating to
	// another user re-runs the query without any extra wiring
	const data = $derived(await UserProfile({ id: page.params.id! }))
</script>

<h1 id="name">{data.user.name}</h1>
<UserAvatar user={data.user} />

<a id="next" href="/user/{Number(page.params.id) + 1}">next user</a>

<Hydrated />
