<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h2>Erstelle dir einen neuen Charakter</h2>
<i>Wer darf dich repräsentieren?</i>

<form method="POST">
	<label>
		Vorname
		<input name="firstName" type="text" required />
	</label>

	<label>
		Dynastie
		<input name="lastName" type="text" value={data.dynasty?.name ?? ''} readonly />
	</label>

	<fieldset>
		<legend>Geschlecht</legend>
		<label><input type="radio" name="gender" value="FEMALE" required /> weiblich</label>
		<label><input type="radio" name="gender" value="MALE" /> männlich</label>
	</fieldset>

	{#if form?.message}
		<p><b>{form.message}</b></p>
	{/if}

	<button type="submit">Erstellen</button>
</form>
