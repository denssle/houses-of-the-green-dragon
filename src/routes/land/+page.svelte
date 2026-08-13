<script lang="ts">
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
			{#if flaeche.leasedByMe}
				<b>— deine Pacht</b>
				{#if flaeche.inSeason}
					<form method="POST" action="?/harvest" use:enhance>
						<input type="hidden" name="plotId" value={flaeche.plotId} />
						<button type="submit">Ernten</button>
					</form>
				{:else}
					<small>— jetzt wächst hier nichts</small>
				{/if}
			{:else if flaeche.leased}
				<small>— verpachtet</small>
			{:else}
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
