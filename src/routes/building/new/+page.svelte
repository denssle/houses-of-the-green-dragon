<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>Bauen wir was Neues!</h2>

{#each data.buildingsOptions as building}
	<section>
		<b>{building.initialName}</b>
		<i>{building.description}</i>
		<p>{building.price}</p>
		<button>Das soll es werden!</button>
	</section>
{/each}
