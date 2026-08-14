<script lang="ts">
	import { base } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!--
	Die Reihenfolge ist die des Blicks: erst wie es um die Stadt steht, dann die Wege
	hinaus, zuletzt das Verzeichnis der Häuser.

	Die Wege stehen in Gruppen, weil sie in Gruppen gebraucht werden — wer hungrig ist,
	sucht den Kornspeicher nicht zwischen Rathaus und Chronik. Eine einzige Reihe aus
	neun Kästen zwingt jedesmal zum Lesen aller neun.
-->

<h2>{data.region?.name ?? 'Die Stadt'}</h2>

{#if data.character}
	{#if data.world}
		<p><i>{data.world.season} im Jahr {data.world.year}.</i></p>
	{/if}

	<!--
		Jahreszeit, Einwohner und Kasse sind dreimal dieselbe Auskunft: wie es um die
		Stadt steht. Drei getrennte Absätze machten daraus drei Meldungen.
	-->
	<p>
		<small>
			{#if data.population}
				{data.population.living} Einwohner, davon {data.population.children}
				{data.population.children === 1 ? 'Kind' : 'Kinder'} —
				{data.population.births} geboren und {data.population.deaths} gestorben in den letzten
				{data.population.overYears} Jahren.
			{/if}
			{#if data.region?.treasury != null}
				In der Stadtkasse liegen {data.region.treasury} Münzen.
			{/if}
		</small>
	</p>

	<section>
		<h3>Auskommen</h3>
		<nav class="actions">
			<a href="{base}/jobs">Arbeit</a>
			<a href="{base}/land">Umland</a>
			<a href="{base}/granary">Kornspeicher</a>
			<a href="{base}/market">Markt</a>
		</nav>
	</section>

	<section>
		<h3>Besitz</h3>
		<nav class="actions">
			<a href="{base}/plot">Grundstücke</a>
			<a href="{base}/building/new">Gebäude bauen</a>
		</nav>
	</section>

	<section>
		<h3>Die Stadt</h3>
		<nav class="actions">
			<a href="{base}/people">Leute</a>
			<a href="{base}/council">Rathaus</a>
			<a href="{base}/chronicle">Chronik</a>
		</nav>
	</section>
{:else}
	<!--
		Ohne Charakter führt keiner dieser Wege irgendwohin: Arbeiten, kaufen und bauen
		tut immer jemand. Also steht hier der eine Weg, der offen ist.
	-->
	<p>
		<i>Noch lebt niemand von dir in dieser Stadt.</i>
	</p>
	<nav class="actions">
		<a href="{base}/character/new">Charakter anlegen</a>
	</nav>
{/if}

<section>
	<h3>Was hier steht</h3>
	{#if data.buildings.length === 0}
		<p><i>Noch steht hier nichts.</i></p>
	{:else}
		<ul>
			{#each data.buildings as building (building.id)}
				<li><a href="{base}/building/{building.id}" class="link">{building.name}</a></li>
			{/each}
		</ul>
	{/if}
</section>
