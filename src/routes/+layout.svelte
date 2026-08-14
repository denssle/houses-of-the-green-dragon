<script lang="ts">
	import { base } from '$app/paths';
	import '../app.css';
	import { enhance } from '$app/forms';

	let { data, children } = $props();
</script>

<svelte:head>
	<title>Houses of the green Dragon</title>
</svelte:head>

<!--
	Ein Maß für die Zeilenlänge und ein Rand zum Fensterrand hin. Ohne beides klebt der
	Text links am Glas und läuft über die volle Breite eines großen Bildschirms — lesbar
	ist das nicht, und die Menüpunkte stehen so weit auseinander, dass sie nicht mehr als
	ein Menü erscheinen.
-->
<div class="mx-auto max-w-3xl px-4 pb-16">
	<header class="flex place-content-around border-b border-gray-200 py-3">
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
				     und SvelteKit leitet `/houses` mit 308 auf `/houses/` um — ohne ihn
				     ginge jeder Klick auf die Übersicht über einen zusätzlichen Umweg. -->
				<a href="{base}/{section.slug}" class="link">{section.title}</a>
			{/if}
		{/each}
	</header>

	<main class="py-6">
		{@render children()}
	</main>

	<footer class="border-t border-gray-200 pt-3">
		<nav class="flex place-content-around">
			<a href="{base}/about" class="link">Über die Seite</a>
			<a href="{base}/impressum" class="link">Impressum</a>
		</nav>
	</footer>
</div>
