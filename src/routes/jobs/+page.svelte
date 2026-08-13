<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Arbeit</h2>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

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
				Arbeitgebers leer, findet die Schicht nicht statt — und kostet dich auch nichts.
			</small>
		</p>
	</section>
{:else}
	<section>
		<h3>Offene Stellen</h3>
		{#if data.jobs.length === 0}
			<p><i>Niemand sucht gerade Leute. Bleibt die Tagelöhnerei in der städtischen Schmiede.</i></p>
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
