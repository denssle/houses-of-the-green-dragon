<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Was in der Stadt zu haben ist</h2>
<p>
	<i>
		Feste Preise, kein Feilschen — wer vorbeikommt, kauft oder lässt es. Du hast {data.money} Münzen.
	</i>
</p>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

{#if data.offers.length === 0}
	<p><i>Niemand bietet gerade etwas an.</i></p>
{:else}
	<ul>
		{#each data.offers as angebot (angebot.id)}
			<li>
				{angebot.quantity} × {angebot.itemName} für {angebot.pricePerUnit} Münzen das Stück
				<small>
					— bei {angebot.sellerName},
					<a href="{base}/building/{angebot.buildingId}" class="link">{angebot.buildingName}</a>
				</small>
				{#if angebot.mine}
					<form method="POST" action="?/withdraw" use:enhance>
						<input type="hidden" name="offerId" value={angebot.id} />
						<button type="submit" class="link">Zurückziehen</button>
					</form>
				{:else}
					<form method="POST" action="?/buy" use:enhance>
						<input type="hidden" name="offerId" value={angebot.id} />
						<input type="number" name="quantity" min="1" max={angebot.quantity} value="1" />
						<button type="submit">Kaufen</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<p>
	<small>
		Im eigenen Laden kostet ein Preisschild nichts. Am Marktplatz zahlt man {data.stallFee} Münzen Standgeld
		an die Stadt — wer ein Haus hat, spart sich das.
	</small>
</p>
