<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Das Umland</h2>
<p><i>{data.season}. Abbauflächen gehören der Stadt und werden verpachtet, nicht verkauft.</i></p>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

<ul>
	{#each data.areas as flaeche (flaeche.plotId)}
		<li>
			{flaeche.address} — {flaeche.yields}
			{#if flaeche.leasedByMe}<b>— deine Pacht</b>{:else if flaeche.leased}<small>
					— verpachtet
				</small>{/if}
			<!--
				**Der Weg zum Hof** (5.32): Auf jeder Pacht steht ein Haus, und darin liegen
				Lager, Aushang und Belegschaft. Von hier führte bisher kein Weg dorthin — zum
				eigenen nur über den Umweg der Häuserliste, zu dem eines anderen gar keiner.
			-->
			{#if flaeche.buildingId}
				— <a href="{base}/building/{flaeche.buildingId}" class="link">{flaeche.buildingName}</a>
			{/if}
			{#if flaeche.leasedByMe}
				{#if flaeche.inSeason}
					<form method="POST" action="?/harvest" use:enhance>
						<input type="hidden" name="plotId" value={flaeche.plotId} />
						<button type="submit">Ernten</button>
					</form>
				{:else}
					<small>— jetzt wächst hier nichts</small>
				{/if}
			{:else if !flaeche.leased}
				<form method="POST" action="?/lease" use:enhance>
					<input type="hidden" name="plotId" value={flaeche.plotId} />
					<button type="submit">Pachten ({data.fee} Münzen)</button>
				</form>
			{/if}
		</li>
	{/each}
</ul>

<p>
	<small>
		Vom Ertrag geht ein Zehnt an die Stadt. Stirbt der Pächter, fällt die Fläche zurück — das ist
		der Unterschied zwischen Pacht und Eigentum.
	</small>
</p>
