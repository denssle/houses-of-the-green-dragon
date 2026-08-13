<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Städtischer Kornspeicher</h2>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

{#if data.hunger}
	<p>
		Du bist <b>{data.hunger.label}</b>
		<small>({data.hunger.satiety} von 100)</small> — du hast {data.money} Münzen.
	</p>
{/if}

<section>
	<h3>Zu kaufen</h3>
	<ul>
		{#each data.offers as ware (ware.itemId)}
			<li>
				{ware.name} — {ware.basePrice} Münzen das Stück
				<small>({ware.description})</small>
				<form method="POST" action="?/buy" use:enhance>
					<input type="hidden" name="itemId" value={ware.itemId} />
					<input type="number" name="quantity" min="1" step="1" value="5" />
					<button type="submit">Kaufen</button>
				</form>
			</li>
		{/each}
	</ul>
</section>

<section>
	<h3>Dein Vorrat</h3>
	{#if data.stock.length === 0}
		<p><i>Deine Kammer ist leer.</i></p>
	{:else}
		<ul>
			{#each data.stock as posten (posten.itemId)}
				<li>
					{posten.quantity} × {posten.name}
					{#if posten.nourishment}
						<form method="POST" action="?/eat" use:enhance>
							<input type="hidden" name="itemId" value={posten.itemId} />
							<button type="submit">Essen</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<p>
		<small>
			Was über die Sättigung hinausginge, verfällt — wer vorsorgen will, lässt das Brot in der
			Kammer.
		</small>
	</p>
</section>
