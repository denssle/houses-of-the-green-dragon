<script lang="ts">
	import '../app.css';
	import { enhance } from '$app/forms';

	let { data, children } = $props();
</script>

<header class="flex place-content-around">
	{#each data.sections as section (section.slug)}
		{#if section.slug === 'logout'}
			<!--
				Kein Link: Die Seite lädt Links beim Überfahren vor — ein Abmelden hinter
				einem `href` löste schon die Maus über dem Menüpunkt aus.
			-->
			<form method="POST" action="/logout" use:enhance>
				<button type="submit" class="link">{section.title}</button>
			</form>
		{:else}
			<a href="/{section.slug}" class="link">{section.title}</a>
		{/if}
	{/each}
</header>

<svelte:head>
	<title>Houses of the green Dragon</title>
</svelte:head>

{@render children()}

<footer>
	<nav class="flex place-content-around">
		<a href="/about" class="link"> Über die Seite </a>
		<a href="/impressum" class="link"> Impressum </a>
	</nav>
</footer>
