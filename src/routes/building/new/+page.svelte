<script lang="ts">
	import type { PageProps } from './$types';
	import type { BuildingTemplate } from '$lib/model/buildingTemplate';

	let { data }: PageProps = $props();

	function build(building: BuildingTemplate) {
		fetch('/building/new', { method: 'POST', body: JSON.stringify(building) })
			.then(value => {
				console.log('new one ', value);
			})
			.catch(reason => {
				console.error(reason);
			});
	}
</script>

<h2>Bauen wir was Neues!</h2>

{#each data.buildingsOptions as building}
	<section>
		<b>{building.initialName}</b>
		<i>{building.description}</i>
		<p>{building.price}</p>
		<button onclick={() => build(building)}>Das soll es werden!</button>
	</section>
{/each}
