<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>Arbeit</h2>

{#if data.mine}
	<section>
		<h3>Deine Stelle</h3>
		<p>
			Du arbeitest bei
			<a href="{base}/building/{data.mine.buildingId}" class="link">{data.mine.buildingName}</a>
			für {data.mine.wage} Münzen je Aktionspunkt.
		</p>
		<form method="POST" action="?/work" use:enhance>
			<button type="submit">Eine Schicht arbeiten</button>
		</form>
		<form method="POST" action="?/quit" use:enhance>
			<button type="submit" class="link">Kündigen</button>
		</form>
		<p>
			<small>
				Was du herstellst, gehört dem Betrieb; was du bekommst, ist Lohn. Ist die Kasse deines
				Arbeitgebers leer, findet die Schicht nicht statt — und kostet dich auch nichts. Fehlt
				dagegen das Material, arbeitest du trotzdem und wirst bezahlt: Dass Arbeit da ist, ist nicht
				deine Sorge.
			</small>
		</p>
	</section>
{:else}
	<section>
		<h3>Offene Stellen</h3>
		{#if data.jobs.length === 0}
			<!--
				**Wer den Ort nennt, soll hinführen** (Punkt 58) — und ihn richtig nennen: Für
				Lohn arbeitet seit 5.26 nicht mehr, wer in der Schmiede vorbeischaut, sondern
				wer einen öffentlichen Bau instand setzt.
			-->
			{#if data.repairable}
				<p>
					<i>
						<!-- Der Name steht für sich: „Arbeit an Rathaus" wäre falsch, und welcher
						     Fall vor einem Hausnamen richtig wäre, weiß die Seite nicht. -->
						Niemand sucht gerade Leute. Zu tun gibt es trotzdem etwas:
						<a href="{base}/building/{data.repairable.id}" class="link">{data.repairable.name}</a>
						— wer dort herrichtet, bekommt Lohn aus der Stadtkasse.
					</i>
				</p>
			{:else}
				<p>
					<i>
						Niemand sucht gerade Leute, und die Häuser der Stadt sind in Ordnung. Wer nichts hat,
						fängt selbst etwas an: ein
						<a href="{base}/plot" class="link">Grundstück</a>
						oder eine <a href="{base}/land" class="link">Pacht im Umland</a>.
					</i>
				</p>
			{/if}
		{:else}
			<ul>
				{#each data.jobs as stelle (stelle.buildingId)}
					<li>
						{stelle.buildingName} bei {stelle.employerName} — {stelle.wage} Münzen je Aktionspunkt,
						{stelle.free}
						{stelle.free === 1 ? 'Stelle' : 'Stellen'} frei
						<form method="POST" action="?/take" use:enhance>
							<input type="hidden" name="buildingId" value={stelle.buildingId} />
							<button type="submit">Antreten</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}
