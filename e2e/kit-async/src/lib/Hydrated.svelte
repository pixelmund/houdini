<script lang="ts">
	// flips once the page is interactive so tests know when they can click
	let hydrated = $state(false)
	$effect(() => {
		hydrated = true
	})
</script>

<p id="hydrated">{hydrated}</p>
