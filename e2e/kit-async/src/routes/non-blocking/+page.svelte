<script lang="ts">
	import { graphql } from '$houdini'
	import Hydrated from '#lib/Hydrated.svelte'

	let id = $state(1)

	const UserName = graphql(`
		query AsyncNonBlockingUser($id: ID!) {
			user(id: $id, snapshot: "async-non-blocking", delay: 300) {
				id
				name
			}
		}
	`)

	// no await: the page renders right away and the query exposes its loading state
	const user = $derived(UserName({ id: String(id) }))
</script>

<button id="next" onclick={() => (id += 1)}>next user</button>

<p id="loading">{user.loading}</p>
<p id="name">{user.current?.user.name ?? ''}</p>

<Hydrated />
