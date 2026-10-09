<script lang="ts">
	import { base } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!--
	Die Reihenfolge ist die des Blicks: erst wie es um die Stadt steht, dann die Wege
	hinaus, zuletzt das Verzeichnis der Häuser.

	Die Wege stehen in Gruppen, weil sie in Gruppen gebraucht werden — wer hungrig ist,
	sucht den Kornspeicher nicht zwischen Arbeit und Grundstücken. Eine einzige Reihe aus
	acht Kästen zwingt jedesmal zum Lesen aller acht.

	**Geschnitten wird nach der Absicht, nicht nach der Bauart** (5.61): „Du" (was du hast
	und tust) und „Was zu haben ist" (was du erwerben kannst). Eine Gruppe „Listen" wäre
	keine — auf dieser Seite ist alles eine Liste, und Umland, Grundstücke und Leute sucht
	man aus drei verschiedenen Gründen auf.
-->

<h2>{data.region?.name ?? 'Die Stadt'}</h2>

{#if data.character}
	{#if data.world}
		<p><i>{data.world.season} im Jahr {data.world.year}.</i></p>
	{/if}

	<!--
		Jahreszeit, Einwohner und Kasse sind dreimal dieselbe Auskunft: wie es um die
		Stadt steht. Drei getrennte Absätze machten daraus drei Meldungen.
	-->
	<p>
		<small>
			{#if data.population}
				{data.population.living} Einwohner, davon {data.population.children}
				{data.population.children === 1 ? 'Kind' : 'Kinder'} —
				{data.population.births} geboren und {data.population.deaths} gestorben in den letzten
				{data.population.overYears} Jahren.
			{/if}
			{#if data.region?.treasury != null}
				In der Stadtkasse liegen {data.region.treasury} Münzen.
			{/if}
		</small>
	</p>

	<!--
		Was von dir selbst handelt: was du bei dir trägst, und wovon du lebst. Beides sieht
		man nach, bevor man irgendwohin geht.
	-->
	<section>
		<h3>Du</h3>
		<nav class="actions">
			<a href="{base}/inventory">Inventar</a>
			<a href="{base}/jobs">Arbeit</a>
		</nav>
	</section>

	<!--
		**„Auskommen" und „Besitz" waren dieselbe Gruppe** (5.61): Das Umland stand unter
		Auskommen und ist Besitz, die Grundstücke standen unter Besitz und sind Auskommen.
		Wer eines von beidem suchte, las ohnehin beide Reihen.

		Was sie wirklich eint, ist die Absicht: etwas erwerben. Die Reihenfolge ist die des
		Preises — vom Laib Brot bis zum eigenen Dach —, und damit auch die eines Lebens in
		dieser Stadt.
	-->
	<section>
		<h3>Was zu haben ist</h3>
		<nav class="actions">
			<!--
				**„Preise", nicht „Markt"** (5.58): Der Marktplatz ist ein Haus mit eigener Seite,
				diese hier ist der Preisvergleich über alle Läden der Stadt. Zwei Dinge, die
				gleich hießen, obwohl sie Verschiedenes zeigen.
			-->
			<a href="{base}/market">Preise</a>
			<a href="{base}/granary">Kornspeicher</a>
			<a href="{base}/land">Umland</a>
			<a href="{base}/plot">Grundstücke</a>
			<a href="{base}/building/new">Gebäude bauen</a>
		</nav>
	</section>

	<!--
		Ohne Überschrift, denn eine Überschrift „Die Stadt" über einem einzigen Link namens
		„Leute" sagte zweimal nichts. Der Weg steht hier, weil unter ihm die Häuser dieser
		Stadt folgen: erst die Nachbarn, dann ihre Dächer.
	-->
	<nav class="actions">
		<a href="{base}/people">Leute</a>
	</nav>
{:else}
	<!--
		Ohne Charakter führt keiner dieser Wege irgendwohin: Arbeiten, kaufen und bauen
		tut immer jemand. Also steht hier der eine Weg, der offen ist.
	-->
	<p>
		<i>Noch lebt niemand von dir in dieser Stadt.</i>
	</p>
	<nav class="actions">
		<a href="{base}/character/new">Charakter anlegen</a>
	</nav>
{/if}

<!--
	Getrennt, weil man sie aus verschiedenen Gründen aufsucht (Punkt 83): Das eine ist
	Politik, das andere Nachbarschaft und Handel. Eine Reihe aus allem zwang jedes Mal
	zum Lesen der ganzen Liste.

	**„Was die Stadt anbietet", nicht „Was der Stadt gehört"** (5.61): Der Eigentümer ist
	hier die uninteressante Hälfte der Auskunft. Man geht dorthin, um zu schlafen
	(Unterkunft), gegen Standgeld anzubieten (Marktplatz), zu wählen (Rathaus) oder für
	Lohn herzurichten (Schmiede) — der Besitz der Stadt ist nur der Grund, warum das
	jedem offensteht. Bei den Privathäusern bleibt es beim Gehören: Dort ist der
	Eigentümer die eigentliche Auskunft.
-->
<section>
	<h3>Was die Stadt anbietet</h3>
	{#if data.publicBuildings.length === 0}
		<p><i>Die Stadt besitzt kein Haus.</i></p>
	{:else}
		<ul>
			{#each data.publicBuildings as building (building.id)}
				<li><a href="{base}/building/{building.id}" class="link">{building.name}</a></li>
			{/each}
		</ul>
	{/if}
</section>

<section>
	<h3>Was den Leuten gehört</h3>
	{#if data.privateBuildings.length === 0}
		<p><i>Noch hat sich niemand ein Dach gebaut.</i></p>
	{:else}
		<ul>
			{#each data.privateBuildings as building (building.id)}
				<li>
					<a href="{base}/building/{building.id}" class="link">{building.name}</a>
					<!-- Wem es gehört, ist hier die eigentliche Auskunft (5.10). -->
					{#if building.ownerName}
						<small>— {building.ownerName}</small>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if data.escheated.length > 0}
	<!--
		Nur wenn es etwas zu sehen gibt: Meistens ist die Gruppe leer, und eine Überschrift
		über einer leeren Liste wäre eine Meldung ohne Vorgang. Wer ein Haus sucht, sieht
		hier zuerst nach (5.42).
	-->
	<section>
		<h3>Ohne Erben zurückgefallen</h3>
		<ul>
			{#each data.escheated as building (building.id)}
				<li><a href="{base}/building/{building.id}" class="link">{building.name}</a></li>
			{/each}
		</ul>
		<p>
			<small>
				Was niemand geerbt hat, gehört der Stadt — bis sie es versteigert. Die Gebote stehen bei den <a
					href="{base}/plot"
					class="link">Grundstücken</a
				>.
			</small>
		</p>
	</section>
{/if}
