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
	<p>Dynastie {data.dynasty.name} by {data.founder?.nickname}</p>
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

{#if data.dynasty}
	<p><a href="{base}/character/new" class="link">Neuen Charakter anlegen</a></p>
{/if}
