<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Bauen wir was Neues!</h2>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

{#each data.buildingsOptions as building (building.optionId)}
	<section>
		<b>{building.initialName}</b>
		<i>{building.description}</i>
		<p>{building.price}</p>
		<form method="POST">
			<input type="hidden" name="optionId" value={building.optionId} />
			<button type="submit">Das soll es werden!</button>
		</form>
	</section>
{/each}
