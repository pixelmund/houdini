<script lang="ts">
	import { graphql } from '$houdini'
	import Hydrated from '#lib/Hydrated.svelte'

	const UserUpdates = graphql(`
		subscription AsyncUserUpdates {
			userUpdate(id: "1", snapshot: "async-subscription") {
				id
				name
			}
		}
	`)

	const UpdateUser = graphql(`
		mutation AsyncSubscriptionUpdateUser($name: String!) {
			updateUser(id: "1", snapshot: "async-subscription", name: $name) {
				id
				name
			}
		}
	`)

	// the subscription is open while this derived is read and closes when the page unmounts
	const updates = $derived(UserUpdates())

	let name = $state('')
</script>

<p id="connected">{updates.connected}</p>
<p id="update">{updates.current?.userUpdate?.name ?? ''}</p>

<input id="input" bind:value={name} />
<button id="mutate" onclick={() => UpdateUser.mutate({ name })}>update</button>

<Hydrated />
