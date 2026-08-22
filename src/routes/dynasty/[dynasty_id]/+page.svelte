<script lang="ts">
	import { base } from '$app/paths';
	import FamilyTree from '$lib/FamilyTree.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>Haus {data.dynasty.name}</h2>

<p>
	{#if data.founder}
		<i>Gegründet von {data.founder.nickname}.</i>
	{:else}
		<!-- Ohne Gründer: eine alteingesessene Familie oder ein gelöschtes Konto (5.10). -->
		<i>Eine Familie, die schon immer hier lebte.</i>
	{/if}
	{#if data.dynasty.isExtinct}
		<b>— erloschen.</b>
	{/if}
</p>

{#if data.tree.length > 0}
	<section>
		<h3>Stammbaum</h3>
		<FamilyTree tree={data.tree} />
	</section>
{:else}
	<p><i>Von diesem Haus ist niemand mehr verzeichnet.</i></p>
{/if}

<p><a href="{base}/people" class="link">Zurück zu den Leuten</a></p>
