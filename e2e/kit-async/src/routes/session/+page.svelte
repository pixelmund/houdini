<script lang="ts">
	import { graphql } from '$houdini'
	import Hydrated from '#lib/Hydrated.svelte'

	// the api answers with the token it was sent, so this proves the session reached the
	// request on the server and in the browser
	const Session = graphql(`
		query AsyncSession {
			session
		}
	`)

	const data = $derived(await Session())
</script>

<p id="session">{data.session}</p>

<Hydrated />
