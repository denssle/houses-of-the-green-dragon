<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>Rathaus</h2>

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
	<h3>Was der Stadt gehört</h3>
	<ul>
		{#each data.publicBuildings as haus (haus.id)}
			<li>
				<a href="{base}/building/{haus.id}" class="link">{haus.name}</a> — Zustand
				{haus.condition} von 100.
				{#if data.holder?.mine && haus.condition < 100}
					<form method="POST" action="?/renovate" use:enhance>
						<input type="hidden" name="buildingId" value={haus.id} />
						<button type="submit">Herrichten ({haus.renovationCost} Münzen)</button>
					</form>
				{/if}
				{#if haus.employer}
					{#if haus.offeredWage === null}
						<i>Es hängt kein Sold aus.</i>
					{:else}
						<i>Sold: {haus.offeredWage} je Aktionspunkt.</i>
					{/if}
					{#if haus.staff.length === 0}
						<!--
							Nur wenn ein Sold aushängt: Steht kein Angebot, ist „niemand im Dienst"
							keine Nachricht, sondern die Wiederholung der Zeile davor.
						-->
						{#if haus.offeredWage !== null}<i>Niemand hat sich gemeldet.</i>{/if}
					{:else}
						<ul>
							{#each haus.staff as person (person.id)}
								<li>
									<a href="{base}/character/{person.id}" class="link">{person.name}</a>
									— {person.wage} Münzen je Aktionspunkt
									{#if data.holder?.mine}
										<form method="POST" action="?/dismiss" use:enhance>
											<input type="hidden" name="buildingId" value={haus.id} />
											<input type="hidden" name="employeeId" value={person.id} />
											<button type="submit" class="link">Entlassen</button>
										</form>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#if data.holder?.mine}
						<form method="POST" action="?/pay" use:enhance>
							<input type="hidden" name="buildingId" value={haus.id} />
							<input
								type="number"
								name="wage"
								value={haus.offeredWage ?? 3}
								min="1"
								aria-label="Sold für {haus.name}"
							/>
							<button type="submit">Sold aussetzen</button>
						</form>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>
	<p>
		<small>
			Öffentliche Bauten verfallen wie jedes andere Haus, und ein verfallenes taugt entsprechend
			weniger — die Unterkunft nimmt weniger Leute auf, die Schmiede wirft weniger ab. Einstürzen
			können sie nicht: Ein Rathaus, das zusammenfällt, nähme der Stadt die Wahl.
		</small>
	</p>

	{#if data.holder?.mine && data.buildable.length > 0 && data.freePlots.length > 0}
		<h3>Bauen lassen</h3>
		{#each data.buildable as vorlage (vorlage.optionId)}
			<form method="POST" action="?/buildPublic" use:enhance>
				<input type="hidden" name="optionId" value={vorlage.optionId} />
				<label>
					{vorlage.name} ({vorlage.price} Münzen) —
					<select name="plotId" aria-label="Grundstück für {vorlage.name}">
						{#each data.freePlots as flaeche (flaeche.id)}
							<option value={flaeche.id}>{flaeche.address}</option>
						{/each}
					</select>
				</label>
				<button type="submit">Errichten</button>
				<small>{vorlage.description}</small>
			</form>
		{/each}
	{/if}
</section>

{#if data.holder?.mine}
	<section>
		<h3>Bauland erschließen</h3>
		<p>
			Die Stadt zahlt {data.development.costPerPlot} Münzen je Grundstück; was dabei entsteht, wird versteigert.
			{#if data.development.running > 0}
				Zurzeit laufen {data.development.running} Versteigerungen.
			{/if}
		</p>
		<form method="POST" action="?/develop" use:enhance>
			<input
				type="number"
				name="count"
				value="1"
				min="1"
				max={data.development.max}
				aria-label="Wie viele Grundstücke"
			/>
			<button type="submit">Ausweisen lassen</button>
		</form>
		<p>
			<small>
				Ein sicheres Geschäft ist es nicht: Sind alle satt, bleibt die Stadt auf den Kosten sitzen.
				Ist Bauland knapp, bringt die Versteigerung ein Vielfaches.
			</small>
		</p>
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
				<!-- „1 Münzen" stand nie da, solange kein Satz auf eins stand — die
				     Aufwandsentschädigung tut es ab Werk. -->
				{gesetz.value}{gesetz.unit === 'PERCENT' ? ' %' : gesetz.value === 1 ? ' Münze' : ' Münzen'}
				— {gesetz.description}.
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
