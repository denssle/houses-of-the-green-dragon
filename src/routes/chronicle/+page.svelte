<script lang="ts">
	import { base } from '$app/paths';
	import ChronicleText from '$lib/ChronicleText.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const SICHTEN = [
		{ key: 'city', label: 'Die Stadt' },
		{ key: 'house', label: 'Mein Haus' },
		{ key: 'me', label: 'Mein Leben' }
	];
</script>

<h2>Chronik {data.regionName}</h2>

<!--
	**Über die Liste, nicht darunter** (Punkt 60). Der Satz ist die Einladung an jeden
	Gast — und stand da, wo man ihn erst liest, wenn man die Liste schon nicht verstanden
	hat.
-->
<p>
	<small>
		{#if data.guest}
			Diese Welt läuft weiter, ob jemand zusieht oder nicht: Ihre Bewohner arbeiten, heiraten,
			bekommen Kinder, wählen ihren Bürgermeister und sterben. Hier steht, was ihnen zugestoßen ist.
		{:else}
			Die Welt läuft weiter, während niemand zusieht. Hier steht, was in der Zwischenzeit geschehen
			ist — vorerst alles, was geschieht.
		{/if}
	</small>
</p>

{#if !data.guest}
	<p>
		{#each SICHTEN as sicht, i (sicht.key)}
			{#if i > 0}·{/if}
			{#if sicht.key === data.view}
				<b>{sicht.label}</b>
			{:else if sicht.key !== 'house' || data.hasHouse}
				<a href="{base}/chronicle?view={sicht.key}" class="link">{sicht.label}</a>
			{/if}
		{/each}
	</p>
{/if}

{#if data.entries.length === 0}
	<p><i>Noch ist nichts geschehen, was der Rede wert wäre.</i></p>
{:else}
	<ul>
		{#each data.entries as eintrag (eintrag.id)}
			<li>
				<small>{eintrag.season} {eintrag.year}:</small>
				<ChronicleText parts={eintrag.parts} />
			</li>
		{/each}
	</ul>
{/if}

{#if !data.guest}
	<p><a href="{base}/" class="link">Zurück in die Stadt</a></p>
{/if}
