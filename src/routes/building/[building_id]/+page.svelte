<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const BESCHRIFTUNG: Record<string, string> = { WORK: 'Arbeiten' };

	/**
	 * Ein Wort für den Zustand. Die Zahl steht daneben — anders als bei Zuneigung und
	 * Wesensart ist sie hier keine Verlockung, sondern die Grundlage der Entscheidung:
	 * Renovieren kostet nach dem, was fehlt.
	 */
	function zustandswort(condition: number): string {
		if (condition >= 90) return 'wie neu';
		if (condition >= 70) return 'gut in Schuss';
		if (condition >= 45) return 'in die Jahre gekommen';
		if (condition >= 20) return 'baufällig';
		return 'kurz vor dem Einsturz';
	}
</script>

<h2>{data.building.name}</h2>
<p><i>{data.option?.description}</i></p>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

<dl>
	{#if data.plot}
		<dt>Lage</dt>
		<dd>{data.plot.address}</dd>
	{/if}

	<dt>Zustand</dt>
	<dd>{data.building.condition} von 100 — {zustandswort(data.building.condition)}</dd>

	<dt>Ausbaustufe</dt>
	<dd>
		{data.levelName ?? data.building.level}
		<small>(Stufe {data.building.level} von {data.maxLevel})</small>
	</dd>

	{#if data.building.forSalePrice !== null}
		<dt>Zu verkaufen</dt>
		<dd>{data.building.forSalePrice} Münzen, samt Grundstück</dd>
	{/if}
</dl>

{#each data.option?.actions ?? [] as action (action)}
	<form method="POST" action="?/act" use:enhance>
		<input type="hidden" name="action" value={action} />
		<button type="submit">{BESCHRIFTUNG[action] ?? action}</button>
	</form>
{/each}

{#if data.mine}
	<section>
		<h3>Instandhaltung</h3>
		{#if data.building.condition < 100}
			<form method="POST" action="?/renovate" use:enhance>
				<button type="submit">Renovieren ({data.renovationCost} Münzen)</button>
			</form>
			<p>
				<small>Wer früh renoviert, zahlt wenig — gezahlt wird nach dem, was fehlt.</small>
			</p>
		{:else}
			<p><i>Hier ist nichts zu tun.</i></p>
		{/if}

		{#if data.upgradeCost !== undefined}
			<form method="POST" action="?/upgrade" use:enhance>
				<button type="submit">Ausbauen ({data.upgradeCost} Münzen)</button>
			</form>
		{:else}
			<p><i>Weiter lässt sich hier nicht ausbauen.</i></p>
		{/if}
	</section>

	<section>
		<h3>Verkaufen</h3>
		<form method="POST" action="?/sell" use:enhance>
			<label>
				Preis
				<input type="number" name="price" min="0" step="1" value={data.building.forSalePrice} />
			</label>
			<button type="submit">Preisschild anhängen</button>
		</form>
		{#if data.building.forSalePrice !== null}
			<form method="POST" action="?/sell" use:enhance>
				<button type="submit" class="link">Doch nicht verkaufen</button>
			</form>
		{/if}
	</section>
{:else if data.building.forSalePrice !== null}
	<section>
		<h3>Zu haben</h3>
		<form method="POST" action="?/buy" use:enhance>
			<button type="submit">Kaufen für {data.building.forSalePrice} Münzen</button>
		</form>
	</section>
{/if}
