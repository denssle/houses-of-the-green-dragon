<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Rathaus</h2>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

<section>
	<h3>{data.office}</h3>
	{#if data.holder}
		<p>
			<a href="{base}/character/{data.holder.characterId}" class="link">{data.holder.name}</a>
			führt die Stadt{#if data.holder.mine}<b> — das bist du.</b>{:else}.{/if}
			{#if data.holder.yearsLeft !== null}
				Noch {data.holder.yearsLeft}
				{data.holder.yearsLeft === 1 ? 'Jahr' : 'Jahre'} Amtszeit.
			{/if}
		</p>
		{#if data.holder.movedUpBy > 0}
			<p>
				<small>
					Nachgerückt: {data.holder.movedUpBy}
					{data.holder.movedUpBy === 1 ? 'Kandidat' : 'Kandidaten'} vor
					{data.holder.name} sind gestorben. Neu gewählt wird deshalb nicht — es zählt weiter das letzte
					Ergebnis.
				</small>
			</p>
		{/if}
	{:else}
		<p><i>Niemand führt die Stadt. Es muss gewählt werden.</i></p>
	{/if}
	<p><i>Stadtkasse: {data.treasury} Münzen</i></p>
</section>

{#if data.ballot}
	<section>
		<h3>Wahl</h3>
		{#if data.ballot.candidates.length === 0}
			<p><i>Noch stellt sich niemand auf.</i></p>
		{:else}
			<ul>
				{#each data.ballot.candidates as kandidat (kandidat.id)}
					<li>
						<a href="{base}/character/{kandidat.id}" class="link">{kandidat.name}</a
						>{#if kandidat.mine}
							(du){/if} — {kandidat.votes}
						{kandidat.votes === 1 ? 'Stimme' : 'Stimmen'}
						{#if !data.ballot.iVoted}
							<form method="POST" action="?/vote" use:enhance>
								<input type="hidden" name="candidateId" value={kandidat.id} />
								<button type="submit">Wählen</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.ballot.iVoted}
			<p><i>Du hast gewählt. Eine Stimme je Kopf.</i></p>
		{/if}

		{#if !data.ballot.iStand}
			<form method="POST" action="?/stand" use:enhance>
				<button type="submit">Selbst antreten</button>
			</form>
		{/if}

		<p>
			<small>
				Es zählen Köpfe, nicht Münzen: Jeder Erwachsene der Stadt hat eine Stimme, und die Einwohner
				geben sie dem, den sie am liebsten mögen. Wer gut zahlt, viele Kinder großzieht und sich
				niemanden zum Feind macht, bekommt sie.
			</small>
		</p>
	</section>
{:else}
	<section>
		<h3>Wahl</h3>
		<p><i>Es wird gerade nicht gewählt. Die nächste Wahl kommt zum Ende der Amtszeit.</i></p>
	</section>
{/if}

<section>
	<h3>Gesetze</h3>
	<p>
		<small>
			Ein Gesetz erfindet keine Regel, es setzt eine Zahl — und zwar eine, die es im Spiel ohnehin
			schon gibt. Was der Bürgermeister erlässt, gilt ab sofort.
		</small>
	</p>
	<ul>
		{#each data.laws as gesetz (gesetz.kind)}
			<li>
				<b>{gesetz.name}:</b>
				{gesetz.value}{gesetz.unit === 'PERCENT' ? ' %' : ' Münzen'} — {gesetz.description}.
				{#if data.holder?.mine}
					<form method="POST" action="?/enact" use:enhance>
						<input type="hidden" name="kind" value={gesetz.kind} />
						<input
							type="number"
							name="value"
							value={gesetz.value}
							min={gesetz.min}
							max={gesetz.max}
							aria-label="Neuer Satz für {gesetz.name}"
						/>
						<button type="submit">Erlassen</button>
						<small>höchstens {gesetz.max}</small>
					</form>
				{/if}
			</li>
		{/each}
	</ul>

	{#if data.chronicle.length > 0}
		<h3>Was bisher erlassen wurde</h3>
		<ul>
			{#each data.chronicle as eintrag (eintrag.kind + eintrag.enactedTick)}
				<li>
					<small>
						Jahr {eintrag.year}: {eintrag.name} auf {eintrag.value}{eintrag.unit === 'PERCENT'
							? ' %'
							: ' Münzen'}{#if eintrag.enactedBy}, erlassen von {eintrag.enactedBy}{/if}.
					</small>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<p><a href="{base}/" class="link">Zurück in die Stadt</a></p>
