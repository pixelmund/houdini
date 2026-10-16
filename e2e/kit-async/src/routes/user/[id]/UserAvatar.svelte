<script lang="ts">
	import { fragment, graphql, type AsyncUserAvatar } from '$houdini'

	let { user }: { user: AsyncUserAvatar } = $props()

	const UserAvatarFragment = graphql(`
		fragment AsyncUserAvatar on User {
			name
			avatarURL
		}
	`)

	const info = $derived(fragment(user, UserAvatarFragment))
</script>

<p id="fragment-name">{info.name}</p>
