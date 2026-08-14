<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
</script>

<!--
	Die Fehlerseite.

	Ohne sie zeigte SvelteKit seine eingebaute — „404 / Not Found", englisch, auf einer
	sonst durchgehend deutschen Seite. Wer sich vertippt oder einem alten Link folgt, soll
	in der Stadt bleiben und nicht in einer Werkzeugmeldung landen.

	Der Weg zurück ist wichtiger als die Zahl: Sie steht klein daneben, für den Fall, dass
	jemand einen Fehler meldet.
-->
<h2>
	{#if page.status === 404}
		Diese Gasse gibt es nicht
	{:else}
		Da ist etwas schiefgegangen
	{/if}
</h2>

<p>
	{#if page.status === 404}
		Kein Haus unter dieser Anschrift — vielleicht ein alter Link, vielleicht ein Vertippen.
	{:else}
		Der Fehler liegt bei uns, nicht bei dir. Versuch es gleich noch einmal; hilft das nicht, sag
		Bescheid.
	{/if}
</p>

<p>
	<a href="{base}/" class="link">Zurück in die Stadt</a>
</p>

<p>
	<small>Fehler {page.status}{page.error?.message ? ` — ${page.error.message}` : ''}</small>
</p>
