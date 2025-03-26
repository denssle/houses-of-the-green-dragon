<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>Erstelle dir einen neuen Charakter</h2>
<i>Wer darf dich repräsentieren?</i>

<form method="POST" class="">
	<label>
		Vorname
		<input name="firstName" type="text" />
	</label>

	<label>
		Dynastie
		<input name="lastName" type="text" value={data.dynasty?.name} readonly />
	</label>

	<button type="submit">Erstellen</button>
</form>
