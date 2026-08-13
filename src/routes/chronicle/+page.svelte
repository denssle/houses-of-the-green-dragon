<script lang="ts">
	import { base } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const SICHTEN = [
		{ key: 'city', label: 'Die Stadt' },
		{ key: 'house', label: 'Mein Haus' },
		{ key: 'me', label: 'Mein Leben' }
	];
</script>

<h2>Chronik</h2>

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

{#if data.entries.length === 0}
	<p><i>Noch ist nichts geschehen, was der Rede wert wäre.</i></p>
{:else}
	<ul>
		{#each data.entries as eintrag (eintrag.id)}
			<li>
				<small>{eintrag.season} {eintrag.year}:</small>
				{#if eintrag.subjectId}
					<a href="{base}/character/{eintrag.subjectId}" class="link">{eintrag.text}</a>
				{:else}
					{eintrag.text}
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<p>
	<small>
		Die Welt läuft weiter, während niemand zusieht. Hier steht, was in der Zwischenzeit geschehen
		ist — vorerst alles, was geschieht.
	</small>
</p>

<p><a href="{base}/" class="link">Zurück in die Stadt</a></p>
