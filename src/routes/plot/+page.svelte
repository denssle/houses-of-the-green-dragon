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
						— bebaut <small>(verkauft wird über das Gebäude)</small>
					{:else}
						— frei, <a href="{base}/building/new" class="link">hier lässt sich bauen</a>
						{#if plot.forSalePrice !== null}
							<b>— für {plot.forSalePrice} Münzen zu haben</b>
						{/if}
						<form method="POST" action="?/sell" use:enhance>
							<input type="hidden" name="plotId" value={plot.id} />
							<input
								type="number"
								name="price"
								min="0"
								step="1"
								value={plot.forSalePrice}
								placeholder="Preis"
							/>
							<button type="submit">Zum Verkauf stellen</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section>
	<h3>Auf dem Markt</h3>
	<p>
		<i>
			Was andere abgeben. Der Preis steht fest — wer ihn zahlt, bekommt es; es wird nicht geboten.
		</i>
	</p>
	{#if data.plotsForSale.length === 0 && data.buildingsForSale.length === 0}
		<p><i>Zurzeit gibt niemand etwas ab.</i></p>
	{:else}
		<ul>
			{#each data.plotsForSale as plot (plot.id)}
				<li>
					{plot.address} — {plot.forSalePrice} Münzen
					<form method="POST" action="?/buyFrom" use:enhance>
						<input type="hidden" name="plotId" value={plot.id} />
						<button type="submit">Kaufen</button>
					</form>
				</li>
			{/each}
			{#each data.buildingsForSale as gebäude (gebäude.id)}
				<li>
					<a href="{base}/building/{gebäude.id}" class="link">{gebäude.name}</a>
					— {gebäude.forSalePrice} Münzen, samt Grundstück
					<small>(Zustand {gebäude.condition})</small>
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
