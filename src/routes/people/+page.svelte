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

{#if data.attire.garmentYearsLeft > 0}
	<p>
		<small>
			Du trägst ein Gewand — es hält noch {data.attire.garmentYearsLeft}
			{data.attire.garmentYearsLeft === 1 ? 'Jahr' : 'Jahre'} und macht dich überall etwas angenehmer.
		</small>
	</p>
{/if}

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
	<!--
		Eine Person ist ein Absatz, keine Aufzählungszeile: erst wer sie ist und wie sie
		zu dir steht, darunter die Handlungen als Leiste. Vorher standen Text und bis zu
		vier Knöpfe in einer Zeile und brachen dort um, wo gerade der Platz endete — bei
		zwölf Leuten fand man weder den Namen noch den Knopf wieder.

		Zwei Leisten, weil es zwei Anlässe sind: Umgang mit der Person und Unterricht bei
		ihr. Die Lehren tragen lange Beschriftungen und verdrängten das Werben sonst aus
		dem Blick.
	-->
	<ul class="entries">
		{#each data.people as person (person.id)}
			<li>
				<p>
					<b>{person.firstName}</b>
					<small
						>({person.title}{VERWANDT[person.kinship]
							? `, ${VERWANDT[person.kinship]}`
							: ''})</small
					>
					— {person.affectionToYou}
					{#if person.isSpouse}
						<b>— dein Ehepartner</b>
					{:else if person.married}
						<small>— anderweitig verheiratet</small>
					{/if}
				</p>

				{#if person.hasProposedToYou}
					<p><b>{person.firstName} hat dir einen Antrag gemacht.</b></p>
				{/if}

				<div class="actions">
					<form method="POST" action="?/visit" use:enhance>
						<input type="hidden" name="personId" value={person.id} />
						<button type="submit">Zeit verbringen ({data.visitCost} AP)</button>
					</form>

					<!--
						Werben und Antrag nur dort, wo sie überhaupt etwas werden können. Die
						Regeln prüft der Server noch einmal — hier geht es nur darum, keine
						Knöpfe anzubieten, die immer scheitern.
					-->
					{#if !data.married && !person.married && person.kinship === 'NONE'}
						<form method="POST" action="?/court" use:enhance>
							<button type="submit">Werben ({data.courtCost} AP)</button>
							{#if data.attire.perfume > 0}
								<label>
									<input type="checkbox" name="perfume" />
									<small>mit Duftwasser ({data.attire.perfume})</small>
								</label>
							{/if}
							<input type="hidden" name="personId" value={person.id} />
						</form>
						<form method="POST" action="?/propose" use:enhance>
							<input type="hidden" name="personId" value={person.id} />
							<button type="submit">Um die Hand anhalten</button>
						</form>
					{/if}

					{#if person.hasProposedToYou}
						<form method="POST" action="?/accept" use:enhance>
							<input type="hidden" name="personId" value={person.id} />
							<button type="submit">Annehmen</button>
						</form>
					{/if}
				</div>

				{#if person.lessons.length > 0}
					<div class="actions">
						<!-- Nur „Lernen" — bei wem, steht zwei Zeilen darüber. -->
						<small>Lernen:</small>
						{#each person.lessons as lehre (lehre.type)}
							<form method="POST" action="?/learn" use:enhance>
								<input type="hidden" name="personId" value={person.id} />
								<input type="hidden" name="skill" value={lehre.type} />
								<button type="submit">
									{lehre.name} lernen ({lehre.fee} Münzen, bis Stufe {lehre.upTo})
								</button>
							</form>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
