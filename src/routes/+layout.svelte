<script lang="ts">
	import { base } from '$app/paths';
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
			<form method="POST" action="{base}/logout" use:enhance>
				<button type="submit" class="link">{section.title}</button>
			</form>
		{:else}
			<!-- Der Schrägstrich am Ende gehört dazu: Die Übersicht hat einen leeren Slug,
			     und SvelteKit leitet `/drachen` mit 308 auf `/drachen/` um — ohne ihn
			     ginge jeder Klick auf die Übersicht über einen zusätzlichen Umweg. -->
			<a href="{base}/{section.slug}" class="link">{section.title}</a>
		{/if}
	{/each}
</header>

<svelte:head>
	<title>Houses of the green Dragon</title>
</svelte:head>

{@render children()}

<footer>
	<nav class="flex place-content-around">
		<a href="{base}/about" class="link"> Über die Seite </a>
		<a href="{base}/impressum" class="link"> Impressum </a>
	</nav>
</footer>
