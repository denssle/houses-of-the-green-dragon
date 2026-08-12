<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>{data.building.name}</h2>
<p><i>{data.option?.description}</i></p>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

{#each data.option?.actions ?? [] as action (action)}
	<section>
		<form method="POST">
			<input type="hidden" name="action" value={action} />
			<button type="submit">{action}</button>
		</form>
	</section>
{/each}
