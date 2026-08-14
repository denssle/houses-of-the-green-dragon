<script lang="ts">
	import { base } from '$app/paths';
	import type { ChroniclePart } from '$lib/chronicleMessage';

	/**
	 * Ein Chroniksatz mit Verweisen auf die Genannten.
	 *
	 * Zwei Seiten zeigen dieselben Sätze — die Chronik und der Lebenslauf auf der
	 * Charakterseite. Deshalb steht das hier und nicht zweimal dort.
	 *
	 * Ein Teil ohne Kennung bleibt Text: So kommt die Gastansicht ohne Sonderfall aus, und
	 * ein Verstorbener, dessen Zeile nicht mehr auffindbar ist, macht den Satz trotzdem
	 * nicht kaputt.
	 */
	let { parts }: { parts: ChroniclePart[] } = $props();
</script>

{#each parts as teil, i (i)}{#if 'text' in teil}{teil.text}{:else if teil.id}<a
			href="{base}/{teil.target === 'building' ? 'building' : 'character'}/{teil.id}"
			class="link">{teil.name}</a
		>{:else}{teil.name}{/if}{/each}
