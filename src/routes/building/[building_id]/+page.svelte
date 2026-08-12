<script lang="ts">
	import type { PageProps } from './$types';
	import type { BuildingAction } from '$lib/model/buildingAction';

	let { data }: PageProps = $props();

	function doAction(action: BuildingAction) {
		fetch('/building/' + data.building?.id, { method: 'POST', body: action });
	}
</script>

<h2>{data.building?.name}</h2>

{#if data.building?.actions}
	{#each data.building?.actions as action}
		<section>
			<button onclick={() => doAction(action)}>{action}</button>
		</section>
	{/each}
{/if}
