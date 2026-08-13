<script lang="ts">
	import { base } from '$app/paths';
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
	{#each data.buildingsOptions as building (building.optionId)}
		<section>
			<b>{building.initialName}</b>
			<i>{building.description}</i>
			<p>{building.price} Münzen</p>
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
