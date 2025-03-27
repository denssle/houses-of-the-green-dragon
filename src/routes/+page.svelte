<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#each data.buildings as building}
	<a href="/building/{building.id}" class="link">{building.name}</a>
{/each}

<a href="/building/new">Gebäude bauen</a>
<button>Nächste Runde</button>
