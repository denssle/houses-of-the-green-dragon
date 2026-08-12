<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const BESCHRIFTUNG: Record<string, string> = { WORK: 'Arbeiten' };
</script>

<h2>{data.building.name}</h2>
<p><i>{data.option?.description}</i></p>

<dl>
	{#if data.plot}
		<dt>Lage</dt>
		<dd>{data.plot.address}</dd>
	{/if}

	<dt>Zustand</dt>
	<dd>{data.building.condition} von 100</dd>

	<dt>Ausbaustufe</dt>
	<dd>{data.building.level}</dd>
</dl>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

{#each data.option?.actions ?? [] as action (action)}
	<section>
		<form method="POST" use:enhance>
			<input type="hidden" name="action" value={action} />
			<button type="submit">{BESCHRIFTUNG[action] ?? action}</button>
		</form>
	</section>
{/each}
