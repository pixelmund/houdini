<script lang="ts">
	let { children } = $props()
</script>

<nav>
	<a href="/">home</a>
	<a href="/user/1">user</a>
	<a href="/non-blocking">non-blocking</a>
	<a href="/mutation">mutation</a>
	<a href="/refresh">refresh</a>
	<a href="/session">session</a>
</nav>

<main>
	{@render children()}
</main>
