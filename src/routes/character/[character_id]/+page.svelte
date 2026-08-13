<script lang="ts">
	import { base } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>{data.character.firstName}</h2>
<p><i>{data.character.title}</i></p>

<dl>
	<dt>Alter</dt>
	<dd>{data.age} Jahre</dd>

	<dt>Aufenthalt</dt>
	<dd>{data.region?.name ?? 'unbekannt'}</dd>

	<dt>Geld</dt>
	<dd>{data.character.money} Münzen</dd>

	<dt>Aktionspunkte</dt>
	<dd>{data.character.actionPoints} von {data.maxActionPoints}</dd>

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

<!--
	Der Arbeitsplatz fehlt hier mit Absicht: Ein Anstellungsverhältnis gibt es erst mit
	4.6 (`employment` mit Lohn und Laufzeit). Bis dahin arbeitet man tageweise dort, wo
	man gerade steht — es gibt schlicht nichts anzuzeigen.
-->
