<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Grundstücke</h2>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

<section>
	<h3>Dein Besitz</h3>
	{#if data.ownedPlots.length === 0}
		<p><i>Dir gehört noch kein Fleckchen Erde.</i></p>
	{:else}
		<ul>
			{#each data.ownedPlots as plot (plot.id)}
				<li>
					{plot.address}
					{#if plot.hasBuilding}
						— bebaut
					{:else}
						— frei, <a href="{base}/building/new" class="link">hier lässt sich bauen</a>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section>
	<h3>Freies Bauland</h3>
	<p><i>Was die Stadt noch nie vergeben hat — {data.price} Münzen je Grundstück.</i></p>
	{#if data.freeLand.length === 0}
		<p><i>Die Stadt ist voll. Wer bauen will, muss jemandem etwas abkaufen.</i></p>
	{:else}
		<ul>
			{#each data.freeLand as plot (plot.id)}
				<li>
					{plot.address}
					<form method="POST" action="?/buy" use:enhance>
						<input type="hidden" name="plotId" value={plot.id} />
						<button type="submit">Kaufen</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</section>
