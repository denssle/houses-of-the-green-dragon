<script lang="ts">
	import { base } from '$app/paths';
	import { buildPrice } from '$lib/model/buildingTemplate';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Bauen wir was Neues!</h2>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

{#if data.freePlots.length === 0}
	<p>
		<i>Dir gehört kein freies Grundstück.</i>
		<a href="{base}/plot" class="link">Erst eines kaufen</a> — gebaut wird nicht ins Leere.
	</p>
{:else}
	{#if data.stock.length > 0}
		<p>
			<small>
				In deiner Kammer: {#each data.stock as posten, i (posten.itemId)}{#if i > 0},
					{/if}{posten.quantity}
					{posten.name}{/each}
			</small>
		</p>
	{/if}

	{#each data.buildingsOptions as building (building.optionId)}
		<section>
			<b>{building.initialName}</b>
			<i>{building.description}</i>
			<p>
				{buildPrice(building)} Münzen{#if building.material.length > 0}
					und
					{#each building.material as posten, i (posten.itemId)}{#if i > 0},
						{/if}{posten.quantity}
						{posten.name}{/each}{/if}
			</p>
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
				<button type="submit">Das soll es werden!</button>
			</form>
		</section>
	{/each}
{/if}
