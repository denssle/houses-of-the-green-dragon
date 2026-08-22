<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>Städtischer Kornspeicher</h2>

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

<!--
	**Der Vorrat ist mit 5.33 ausgezogen.** Er hing hier, weil hier das Brot herkam — aber
	das eigene Inventar gehört nicht in einen fremden Laden. Was bleibt, ist der Hinweis, wie
	viel noch hineinpasst: Das ist die Zahl, die man beim Einkaufen braucht.
-->
<section>
	<h3>Dein Inventar</h3>
	<p>
		{data.used} von {data.capacity} Stück belegt.
		<a href="{base}/inventory" class="link">Ansehen</a>
	</p>
	<p>
		<small>
			Was über die Sättigung hinausginge, verfällt beim Essen — wer vorsorgen will, lässt das Brot
			liegen.
		</small>
	</p>
</section>
