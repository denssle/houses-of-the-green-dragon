<script lang="ts">
	import { base } from '$app/paths';
	import { buildPrice, costLine, itemLine } from '$lib/model/buildingTemplate';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>Bauen</h2>

{#if data.freePlots.length === 0}
	<p>
		<i>Dir gehört kein freies Grundstück.</i>
		<a href="{base}/plot" class="link">Erst eines kaufen</a> — gebaut wird nicht ins Leere.
	</p>
{:else}
	{#if data.stock.length > 0}
		<p>
			<small>In deinem Inventar: {itemLine(data.stock)}</small>
		</p>
	{/if}

	{#each data.buildingsOptions as building (building.optionId)}
		<section>
			<b>{building.initialName}</b>
			<i>{building.description}</i>
			<p>{costLine(buildPrice(building), building.material)}</p>
			<!--
				**Der Grund gehört neben den Knopf, nicht hinter den Klick** (Punkt 59). Gesperrt
				wird nichts: Wer zwanzig Münzen zu wenig hat, verkauft etwas und baut — ein
				toter Knopf verspräche „nie" und wäre falsch.
			-->
			{#if building.missing.length > 0}
				<p><small>Dafür fehlen dir noch: {building.missing.join(', ')}.</small></p>
			{/if}
			<form method="POST" use:enhance>
				<input type="hidden" name="optionId" value={building.optionId} />
				<label>
					Grundstück
					<select name="plotId">
						{#each data.freePlots as plot (plot.id)}
							<option value={plot.id}>{plot.address}</option>
						{/each}
					</select>
				</label>
				<button type="submit">Errichten</button>
			</form>
		</section>
	{/each}
{/if}
