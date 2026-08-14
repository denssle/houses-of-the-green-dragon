<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Dein Haus</h2>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

{#if data.dynasty}
	<p>
		Haus <b>{data.dynasty.name}</b>{#if data.founder}, gegründet von {data.founder.nickname}{/if}
	</p>
{:else}
	<p>
		<i>Du hast kein Haus mehr.</i>
		Wer ohne Erben stirbt, dessen Linie endet — Besitz und Boden sind an die Stadt gefallen. Was bleibt,
		ist der Name in der Stadtgeschichte.
	</p>
	<form method="POST" action="?/found" use:enhance>
		<label>
			Name des neuen Hauses
			<input type="text" name="name" required />
		</label>
		<button type="submit">Haus gründen</button>
	</form>
{/if}

{#if data.tree.length > 0}
	<section>
		<h3>Stammbaum</h3>
		<!--
			Bewusst eine Liste und kein gezeichneter Baum: Die Verwandtschaft steht als
			Text daneben, und das trägt, solange ein Haus wenige Generationen umfasst.
			Eine echte Darstellung mit Linien lohnt erst, wenn es etwas zu verzweigen
			gibt — dann aber gern.
		-->
		<ul>
			{#each data.tree as person (person.id)}
				{@const eltern = data.tree.filter(
					(m) => m.id === person.motherId || m.id === person.fatherId
				)}
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
	</section>
{/if}

{#if data.former.length > 0}
	<section>
		<h3>Erloschene Häuser</h3>
		<ul>
			{#each data.former as haus (haus.id)}
				<li>{haus.name}</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.dynasty && !data.hasCharacter}
	<p><a href="{base}/character/new" class="link">Neuen Charakter anlegen</a></p>
{/if}
