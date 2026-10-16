<script lang="ts">
	import { graphql } from '$houdini'
	import Hydrated from '#lib/Hydrated.svelte'
	import UserAvatar from '../user/[id]/UserAvatar.svelte'

	const MutationUser = graphql(`
		query AsyncMutationUser {
			user(id: "1", snapshot: "async-mutation") {
				id
				name
				...AsyncUserAvatar
			}
		}
	`)

	const UpdateUser = graphql(`
		mutation AsyncUpdateUser($name: String!) {
			updateUser(id: "1", snapshot: "async-mutation", name: $name, delay: 300) {
				id
				name
			}
		}
	`)

	const data = $derived(await MutationUser())

	let name = $state('')
</script>

<h1 id="name">{data.user.name}</h1>
<UserAvatar user={data.user} />

<input id="input" bind:value={name} />
<button id="mutate" onclick={() => UpdateUser.mutate({ name })}>update</button>
<p id="pending">{UpdateUser.pending}</p>

<Hydrated />
