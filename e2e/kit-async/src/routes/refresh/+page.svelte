<script lang="ts">
	import { graphql } from '$houdini'
	import Hydrated from '#lib/Hydrated.svelte'

	const RefreshUser = graphql(`
		query AsyncRefreshUser {
			user(id: "2", snapshot: "async-refresh") {
				id
				name
			}
		}
	`)

	const data = $derived(await RefreshUser())
</script>

<h1 id="name">{data.user.name}</h1>
<button id="refresh" onclick={() => RefreshUser().refresh()}>refresh</button>

<Hydrated />
