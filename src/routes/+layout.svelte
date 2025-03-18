<script lang="ts">
	import '../app.css';

	let { data, children } = $props();
</script>

<header class="flex place-content-around">
	{#each data.sections as section}
		<a href="/{section.slug}" class="link">{section.title}</a>
	{/each}
</header>

<svelte:head>
	<title>Houses of the green Dragon</title>
</svelte:head>

{@render children()}

<footer>
	<nav class="flex place-content-around">
		<a href="/about" class="link">
			Über die Seite
		</a>
		<a href="/impressum" class="link">
			Impressum
		</a>
	</nav>
</footer>
