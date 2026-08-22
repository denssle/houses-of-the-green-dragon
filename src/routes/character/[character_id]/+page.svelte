<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import ChronicleText from '$lib/ChronicleText.svelte';
	import { MAX_NAME_LENGTH, MIN_NAME_LENGTH } from '$lib/game/naming.logic';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>{data.displayName}</h2>
<p>
	<i>{data.character.title}</i>
	{#if data.house}
		<!-- Der Name führt jetzt hin (Punkt 81): Wer zu einer Familie gehört, soll
		     nachschlagen können, zu welcher. -->
		— aus dem Haus
		<a href="{base}/dynasty/{data.house.id}" class="link">{data.house.name}</a>
	{/if}
	{#if data.diedInYear !== null}
		<b>— gestorben im Jahr {data.diedInYear}</b>
	{/if}
</p>

<dl>
	<dt>Alter</dt>
	<dd>
		{data.age} Jahre
		<small>— geboren im {data.born.season} {data.born.year}</small>
		{#if data.mortal && data.diedInYear === null}
			<i>— die Jahre zählen</i>
		{/if}
	</dd>

	<dt>Aufenthalt</dt>
	<dd>{data.region?.name ?? 'unbekannt'}</dd>

	<!--
		Geld, Aktionspunkte und Sättigung stehen nur auf der eigenen Seite: Was jemand in
		der Truhe hat, sieht man ihm nicht an.

		Geprüft wird `data.purse` und nicht `data.self` — der Beutel ist bei einer fremden
		Person gar nicht erst geladen, und diese Bedingung sagt das. Ein `{#if data.self}`
		verbarg früher nur die Anzeige, während die Zahlen mit ausgeliefert wurden (5.22).
	-->
	{#if data.purse}
		<dt>Geld</dt>
		<dd>{data.purse.money} Münzen</dd>

		<dt>Aktionspunkte</dt>
		<dd>
			{data.purse.actionPoints} von {data.maxActionPoints}
			<!--
				**Der Takt der Welt, dort wo er zählt** (Punkt 57): eine Stunde Wirklichkeit
				ist eine Stunde in Grünau. Ohne diese Zeile war „warte" die ganze Auskunft.
			-->
			{#if data.nextPointInMinutes !== undefined && data.purse.actionPoints < data.maxActionPoints}
				<small>
					— der nächste in {data.nextPointInMinutes}
					{data.nextPointInMinutes === 1 ? 'Minute' : 'Minuten'}
				</small>
			{/if}
		</dd>

		<dt>Zustand</dt>
		<dd>
			{#if data.hunger}{data.hunger.label} <small>({data.hunger.satiety} von 100)</small>{/if}
		</dd>
	{/if}

	<dt>Wesensart</dt>
	<dd>
		{data.nature}
		<!--
			Keine Zahlen: Sechs Werte zwischen -100 und +100 lüden dazu ein, den passenden
			Erben auszurechnen. Ein Wort sagt, worauf man sich einstellen muss.
		-->
	</dd>

	<dt>Familienstand</dt>
	<dd>
		{#if data.spouse}
			verheiratet mit
			<a href="{base}/character/{data.spouse.id}" class="link"
				>{data.spouseName ?? data.spouse.firstName}</a
			>
			{#if data.character.pregnantSinceTick !== null}
				<b>— ein Kind ist unterwegs</b>
			{/if}
		{:else}
			<i>unverheiratet</i>
		{/if}
	</dd>

	<dt>Zuhause</dt>
	<dd>
		{#if data.home}
			<a href="{base}/building/{data.home.id}" class="link">{data.home.name}</a>
		{:else}
			<i>ohne Dach über dem Kopf</i>
		{/if}
	</dd>
</dl>

<section>
	<h3>Können</h3>
	{#if data.skills.length === 0}
		<p><i>Noch nichts gelernt. Wer arbeitet, wird besser.</i></p>
	{:else}
		<ul>
			{#each data.skills as fertigkeit (fertigkeit.type)}
				<li>
					{fertigkeit.name} — Stufe {fertigkeit.level}
					<small>({fertigkeit.towardsNext} % bis zur nächsten)</small>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section>
	<h3>Besitz</h3>
	{#if data.plots.length === 0 && data.buildings.length === 0}
		<p>
			<i>{data.self ? 'Noch gehört dir nichts.' : 'Besitz hat diese Person keinen.'}</i>
		</p>
	{/if}

	{#if data.plots.length > 0}
		<h4>Grundstücke</h4>
		<ul>
			{#each data.plots as plot (plot.id)}
				<!-- Auch hier führt „bebaut" jetzt hin, wo gebaut wurde (Punkt 80). -->
				<li>
					{plot.address}
					{#if plot.building}
						— bebaut mit
						<a href="{base}/building/{plot.building.id}" class="link">{plot.building.name}</a>
					{:else}
						— frei
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.buildings.length > 0}
		<h4>Gebäude</h4>
		<ul>
			{#each data.buildings as building (building.id)}
				<li>
					<a href="{base}/building/{building.id}" class="link">{building.name}</a>
					— Zustand {building.condition}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section>
	<h3>{data.self ? 'Erbfolge' : 'Kinder'}</h3>
	{#if data.children.length === 0}
		<p>
			{#if data.self}
				<i>Du hast keine Kinder.</i>
				Stirbst du so, erlischt dein Haus und dein Besitz fällt an die Stadt.
			{:else}
				<i>Kinder hat diese Person keine.</i>
			{/if}
		</p>
	{:else}
		{#if data.self}
			<p>
				<i>
					Wer erbt, entscheidest du. Die übrigen Kinder bekommen ihren gesetzlichen Anteil am
					Bargeld; Grundstücke und Gebäude gehen ungeteilt an den Erben.
				</i>
			</p>
		{/if}
		<ul class="entries">
			{#each data.children as kind (kind.id)}
				<li>
					<p>
						<a href="{base}/character/{kind.id}" class="link">{kind.firstName}</a>, {kind.age}
						Jahre — <i>{kind.nature}</i>
						{#if kind.isHeir && data.self}<b>— dein Erbe</b>{/if}
					</p>
					<!--
						Die Erbenwahl steht nur auf der eigenen Seite: Über fremde Häuser
						bestimmt niemand.
					-->
					{#if data.self}
						<div class="actions">
							{#if kind.isHeir}
								<form method="POST" action="?/heir" use:enhance>
									<button type="submit" class="link">Benennung zurücknehmen</button>
								</form>
							{:else}
								<form method="POST" action="?/heir" use:enhance>
									<input type="hidden" name="heirId" value={kind.id} />
									<button type="submit">Zum Erben bestimmen</button>
								</form>
							{/if}

							<!--
								Der Name steht zur Änderung, solange das Kind klein ist. Danach
								nicht mehr: Ein Erwachsener, der umbenannt werden kann, ist für
								alle anderen niemand, auf den man sich beziehen könnte.
							-->
							{#if kind.nameable}
								<form method="POST" action="?/rename" use:enhance>
									<input type="hidden" name="childId" value={kind.id} />
									<input
										type="text"
										name="firstName"
										value={kind.firstName}
										required
										minlength={MIN_NAME_LENGTH}
										maxlength={MAX_NAME_LENGTH}
										aria-label="Name von {kind.firstName}"
									/>
									<button type="submit">Umbenennen</button>
								</form>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		{#if data.self}
			<p>
				<small>
					Ohne Benennung erbt das älteste volljährige Kind — aber nur, wenn es dich überlebt.
				</small>
			</p>
		{/if}
	{/if}
</section>

<!--
	Der Arbeitsplatz fehlt hier mit Absicht: Ein Anstellungsverhältnis gibt es erst mit
	4.6 (`employment` mit Lohn und Laufzeit). Bis dahin arbeitet man tageweise dort, wo
	man gerade steht — es gibt schlicht nichts anzuzeigen.
-->

{#if data.life.length > 0}
	<section>
		<h3>Lebenslauf</h3>
		<ul>
			{#each data.life as eintrag (eintrag.id)}
				<li>
					<small>Jahr {eintrag.year}:</small>
					<ChronicleText parts={eintrag.parts} />
				</li>
			{/each}
		</ul>
	</section>
{/if}
