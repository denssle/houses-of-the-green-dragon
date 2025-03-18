<script lang="ts">
	import '../app.css';

	let { data, children } = $props();
</script>

<header class="flex place-content-around">
	{#each data.sections as section}
		<a href="/{section.slug}" class="text-blue-600 visited:text-purple-600">{section.title}</a>
	{/each}
</header>

{@render children()}

<footer>
	<nav class="flex place-content-around">
		<a href="/about" class="text-blue-600 visited:text-purple-600">
			Über die Seite
		</a>
		<a href="/impressum" class="text-blue-600 visited:text-purple-600">
			Impressum
		</a>
	</nav>
</footer>
