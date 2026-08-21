<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Wie viel noch hineingeht — nie unter null, auch wenn man schon darüber liegt. */
	const frei: number = $derived(Math.max(0, data.capacity - data.used));
</script>

<h2>Deine Kammer</h2>

<p>
	<b>{data.used} von {data.capacity} Stück.</b>
	{#if data.used > data.capacity}
		<i>Übervoll — es kommt nichts mehr hinein, bis du etwas loswirst.</i>
	{:else if frei === 0}
		<i>Voll.</i>
	{:else}
		<small>Noch {frei} frei.</small>
	{/if}
</p>
<p>
	<small>
		{data.carried} trägst du am Leib.
		{#if data.fromHome > 0}
			Dein Dach nimmt {data.fromHome} weitere auf.
		{:else}
			Ein eigenes Haus nähme mehr auf — ein Saal voller Fremder tut es nicht.
		{/if}
	</small>
</p>

{#if data.hunger}
	<p>
		Du bist <b>{data.hunger.label}</b>
		<small>({data.hunger.satiety} von 100)</small>
	</p>
{/if}

{#if data.garmentYearsLeft > 0}
	<p>
		<i>
			Du trägst ein Gewand; es hält noch {data.garmentYearsLeft}
			{data.garmentYearsLeft === 1 ? 'Jahr' : 'Jahre'}.
		</i>
	</p>
{/if}

<section>
	<h3>Was darin liegt</h3>
	{#if data.stock.length === 0}
		<p>
			<i>Deine Kammer ist leer.</i>
			Gekauftes und Geerntetes landet hier — im
			<a href="{base}/granary" class="link">Kornspeicher</a>
			gibt es Brot, im <a href="{base}/market" class="link">Markt</a> alles andere.
		</p>
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
					{#if posten.itemId === 'GARMENT'}
						<form method="POST" action="?/wear" use:enhance>
							<button type="submit">Anziehen</button>
						</form>
					{/if}
					{#if posten.itemId === 'TONIC'}
						<form method="POST" action="?/drink" use:enhance>
							<button type="submit">Trinken</button>
						</form>
					{/if}
					<!--
						**Der Ausweg neben der Grenze:** Ein Betriebslager fasst unbegrenzt, also
						ist Einlagern die Antwort auf eine volle Kammer. Wer kein Haus hat, sieht
						hier nichts — für den ist die Antwort ein Haus.
					-->
					{#if data.buildings.length > 0}
						<form method="POST" action="?/store" use:enhance>
							<input type="hidden" name="itemId" value={posten.itemId} />
							<input
								type="number"
								name="quantity"
								min="1"
								max={posten.quantity}
								value={posten.quantity}
								aria-label="Wie viel {posten.name}"
							/>
							<select name="buildingId" aria-label="Wohin mit {posten.name}">
								{#each data.buildings as haus (haus.id)}
									<option value={haus.id}>{haus.name}</option>
								{/each}
							</select>
							<button type="submit">Einlagern</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<p>
		<small>
			Was über die Sättigung hinausginge, verfällt beim Essen — wer vorsorgen will, lässt das Brot
			liegen. Und was hier liegt, ist vor Raubzügen sicher: Die Kammer ist das, was zwischen dir und
			dem Verhungern steht.
		</small>
	</p>
</section>

{#if data.buildings.length > 0}
	<section>
		<h3>In deinen Lagern</h3>
		<!--
			**Die Gegenrichtung** (5.34): Ein Lager fasst unbegrenzt, die Kammer nicht — also
			liegt dort das Meiste, und geholt wird, was man gerade braucht. Essen, Anziehen
			und ein Stand am Marktplatz gehen nur aus der Kammer.
		-->
		{#each data.buildings as haus (haus.id)}
			<h4>
				<a href="{base}/building/{haus.id}" class="link">{haus.name}</a>
			</h4>
			{#if haus.stock.length === 0}
				<p><i>Nichts eingelagert.</i></p>
			{:else}
				<ul>
					{#each haus.stock as posten (posten.itemId)}
						<li>
							{posten.quantity} × {posten.name}
							<form method="POST" action="?/fetch" use:enhance>
								<input type="hidden" name="itemId" value={posten.itemId} />
								<input type="hidden" name="buildingId" value={haus.id} />
								<input
									type="number"
									name="quantity"
									min="1"
									max={posten.quantity}
									value="1"
									aria-label="Wie viel {posten.name} aus {haus.name}"
								/>
								<button type="submit">Holen</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		{/each}
	</section>
{/if}

<p><a href="{base}/" class="link">Zurück in die Stadt</a></p>
