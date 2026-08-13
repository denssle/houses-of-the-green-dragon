<script lang="ts">
	import { base } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>{data.region?.name ?? 'Die Stadt'}</h2>

{#if data.region?.treasury !== null && data.region?.treasury !== undefined}
	<p><i>Stadtkasse: {data.region.treasury} Münzen</i></p>
{/if}

{#if data.world}
	<p><i>{data.world.season} im Jahr {data.world.year}.</i></p>
{/if}

{#if data.population}
	<p>
		<i>
			{data.population.living} Einwohner, davon {data.population.children}
			{data.population.children === 1 ? 'Kind' : 'Kinder'} —
			{data.population.births} geboren und {data.population.deaths} gestorben in den letzten
			{data.population.overYears} Jahren.
		</i>
	</p>
{/if}

{#if data.buildings.length === 0}
	<p><i>Noch steht hier nichts.</i></p>
{:else}
	<ul>
		{#each data.buildings as building (building.id)}
			<li><a href="{base}/building/{building.id}" class="link">{building.name}</a></li>
		{/each}
	</ul>
{/if}

<p>
	<a href="{base}/plot" class="link">Grundstücke</a> ·
	<a href="{base}/building/new" class="link">Gebäude bauen</a> ·
	<a href="{base}/people" class="link">Leute</a> ·
	<a href="{base}/granary" class="link">Kornspeicher</a> ·
	<a href="{base}/land" class="link">Umland</a> ·
	<a href="{base}/market" class="link">Markt</a>
</p>
