<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>{data.region?.name ?? 'Die Stadt'}</h2>

{#if data.region?.treasury !== null && data.region?.treasury !== undefined}
	<p><i>Stadtkasse: {data.region.treasury} Münzen</i></p>
{/if}

{#if data.buildings.length === 0}
	<p><i>Noch steht hier nichts.</i></p>
{:else}
	<ul>
		{#each data.buildings as building (building.id)}
			<li><a href="/building/{building.id}" class="link">{building.name}</a></li>
		{/each}
	</ul>
{/if}

<p>
	<a href="/plot" class="link">Grundstücke</a> ·
	<a href="/building/new" class="link">Gebäude bauen</a>
</p>
