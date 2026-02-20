<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>CIK-OIG Check</title>
	<meta name="description" content="SEC EDGAR Entity Search + OIG Exclusion Cross-Reference" />
	<link rel="stylesheet" href="/fontawesome/css/all.min.css" />
</svelte:head>

{@render children()}
