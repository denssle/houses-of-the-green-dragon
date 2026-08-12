<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>Die Stadt</h2>

{#if data.buildings.length === 0}
	<p><i>Noch steht hier nichts.</i></p>
{/if}

{#each data.buildings as building (building.id)}
	<a href="/building/{building.id}" class="link">{building.name}</a>
{/each}

<p><a href="/building/new">Gebäude bauen</a></p>
