<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Dein Konto</h2>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

<dl>
	<dt>Nickname</dt>
	<dd>{data.nickname}</dd>

	<dt>E-Mail</dt>
	<dd>{data.email ?? 'keine hinterlegt'}</dd>
</dl>

<p>
	<small>
		Mehr wird über dich nicht gespeichert — was das Spiel über deine Figuren weiß, steht in der
		<a href="{base}/datenschutz" class="link">Datenschutzerklärung</a>.
	</small>
</p>

<section>
	<h3>Konto löschen</h3>

	<!--
		Die Erklärung gehört vor den Knopf und nicht dahinter: Wer hier klickt, soll wissen,
		was bleibt — nicht, weil es rechtlich nötig wäre, sondern weil es überrascht.
	-->
	<p>
		Deine Daten verschwinden: Nickname, E-Mail und Passwort werden gelöscht, alle Sitzungen enden,
		und eine Anmeldung ist danach nicht mehr möglich.
	</p>
	<p>
		<b>Deine Figuren bleiben in der Welt</b> — namenlos, und von niemandem mehr gespielt. Sie wohnen
		weiter, arbeiten weiter und sterben irgendwann wie alle anderen.
	</p>
	<p>
		<small>
			Das ist keine Ausrede, sondern die einzige Möglichkeit: An deinem Haus hängen Gebäude, Ämter
			und die Vorfahren anderer Spieler. Deine Figuren zu entfernen hieße, in fremde Stammbäume
			Löcher zu reißen und Ereignisse ungeschehen zu machen, an denen andere beteiligt waren. Was
			bleibt, trägt deinen Namen nicht mehr.
		</small>
	</p>

	<form method="POST" action="?/delete" use:enhance class="actions">
		<label>
			Zum Bestätigen <b>{data.nickname}</b> eintragen
			<input type="text" name="nickname" required aria-label="Nickname zur Bestätigung" />
		</label>
		<button type="submit">Konto endgültig löschen</button>
	</form>
</section>
