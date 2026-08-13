<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** Das Wort für die Verwandtschaft — 'NONE' bleibt unerwähnt. */
	const VERWANDT: Record<string, string> = {
		SPOUSE: 'Ehepartner',
		PARENT: 'Elternteil',
		CHILD: 'Kind',
		SIBLING: 'Geschwister',
		GRANDPARENT: 'Großelternteil',
		GRANDCHILD: 'Enkelkind'
	};
</script>

<h2>Leute in {data.region?.name ?? 'der Stadt'}</h2>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

<p>
	<i>
		Wie die anderen zu dir stehen. Zuneigung will genährt werden — ungepflegt wird man sich mit der
		Zeit schlicht egal.
	</i>
</p>

{#if data.people.length === 0}
	<p><i>Hier ist sonst niemand.</i></p>
{:else}
	<ul>
		{#each data.people as person (person.id)}
			<li>
				{person.firstName}
				<small
					>({person.title}{VERWANDT[person.kinship] ? `, ${VERWANDT[person.kinship]}` : ''})</small
				>
				— {person.affectionToYou}
				<form method="POST" action="?/visit" use:enhance>
					<input type="hidden" name="personId" value={person.id} />
					<button type="submit">Zeit verbringen ({data.cost} AP)</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}
