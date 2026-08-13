<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>{data.character.firstName}</h2>
<p><i>{data.character.title}</i></p>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

<dl>
	<dt>Alter</dt>
	<dd>
		{data.age} Jahre
		{#if data.mortal}
			<i>— die Jahre zählen</i>
		{/if}
	</dd>

	<dt>Aufenthalt</dt>
	<dd>{data.region?.name ?? 'unbekannt'}</dd>

	<dt>Geld</dt>
	<dd>{data.character.money} Münzen</dd>

	<dt>Aktionspunkte</dt>
	<dd>{data.character.actionPoints} von {data.maxActionPoints}</dd>

	<dt>Zustand</dt>
	<dd>
		{#if data.hunger}{data.hunger.label} <small>({data.hunger.satiety} von 100)</small>{/if}
	</dd>

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
			verheiratet mit {data.spouse.firstName}
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
		<p><i>Noch gehört dir nichts.</i></p>
	{/if}

	{#if data.plots.length > 0}
		<h4>Grundstücke</h4>
		<ul>
			{#each data.plots as plot (plot.id)}
				<li>{plot.address}{plot.hasBuilding ? ' — bebaut' : ' — frei'}</li>
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
	<h3>Erbfolge</h3>
	{#if data.children.length === 0}
		<p>
			<i>Du hast keine Kinder.</i>
			Stirbst du so, erlischt dein Haus und dein Besitz fällt an die Stadt.
		</p>
	{:else}
		<p>
			<i>
				Wer erbt, entscheidest du. Die übrigen Kinder bekommen ihren gesetzlichen Anteil am Bargeld;
				Grundstücke und Gebäude gehen ungeteilt an den Erben.
			</i>
		</p>
		<ul>
			{#each data.children as kind (kind.id)}
				<li>
					{kind.firstName}, {kind.age} Jahre — <i>{kind.nature}</i>
					{#if kind.isHeir}
						<b>— dein Erbe</b>
						<form method="POST" action="?/heir" use:enhance>
							<button type="submit" class="link">Benennung zurücknehmen</button>
						</form>
					{:else}
						<form method="POST" action="?/heir" use:enhance>
							<input type="hidden" name="heirId" value={kind.id} />
							<button type="submit">Zum Erben bestimmen</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		<p>
			<small>
				Ohne Benennung erbt das älteste volljährige Kind — aber nur, wenn es dich überlebt.
			</small>
		</p>
	{/if}
</section>

<!--
	Der Arbeitsplatz fehlt hier mit Absicht: Ein Anstellungsverhältnis gibt es erst mit
	4.6 (`employment` mit Lohn und Laufzeit). Bis dahin arbeitet man tageweise dort, wo
	man gerade steht — es gibt schlicht nichts anzuzeigen.
-->
