<script lang="ts">
	import { base } from '$app/paths';
	import type { TreeMember } from '$lib/server/service/familyService';

	/**
	 * Der Stammbaum eines Hauses.
	 *
	 * **Herausgelöst mit 5.46**, weil ihn seither zwei Seiten zeigen: das eigene Haus und
	 * das eines Fremden (Punkt 81). Zweimal dieselbe Liste zu pflegen hieße, dass sie
	 * irgendwann verschieden aussehen — und niemand könnte sagen, welche die richtige ist.
	 *
	 * Bewusst eine Liste und kein gezeichneter Baum: Die Verwandtschaft steht als Text
	 * daneben, und das trägt, solange ein Haus wenige Generationen umfasst. Eine echte
	 * Darstellung mit Linien lohnt erst, wenn es etwas zu verzweigen gibt — dann aber gern.
	 */
	let { tree }: { tree: TreeMember[] } = $props();
</script>

<ul>
	{#each tree as person (person.id)}
		{@const eltern = tree.filter((m) => m.id === person.motherId || m.id === person.fatherId)}
		<li>
			<a href="{base}/character/{person.id}" class="link">
				{#if person.isPlayed}<b>{person.firstName}</b>{:else}{person.firstName}{/if}
			</a>
			— {person.age} Jahre{person.alive ? '' : ', gestorben'}
			{#if eltern.length > 0}
				<!-- Auch die Eltern sind Personen, die man nachschlagen können soll. -->
				<small>
					Kind von
					{#each eltern as elternteil, i (elternteil.id)}
						{#if i > 0}und{/if}
						<a href="{base}/character/{elternteil.id}" class="link">{elternteil.firstName}</a>
					{/each}
				</small>
			{:else}
				<small>Beginn der Linie</small>
			{/if}
		</li>
	{/each}
</ul>
