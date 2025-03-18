<script lang="ts">
	import '../app.css';

	let { data, children } = $props();
</script>

<header>
	{#each data.sections as section}
		<a href="/{section.slug}">{section.title}</a>
	{/each}
</header>

{@render children()}

<footer>
	<nav>
		<a href="/about">Über die Seite</a>
		<a href="/impressum">Impressum</a>
	</nav>
</footer>
