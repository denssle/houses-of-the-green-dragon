<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>{data.character.firstName}</h2>
<p><i>{data.character.title}</i></p>

<dl>
	<dt>Alter</dt>
	<dd>{data.age} Jahre</dd>

	<dt>Geld</dt>
	<dd>{data.character.money} Münzen</dd>

	<dt>Aktionspunkte</dt>
	<dd>{data.character.actionPoints}</dd>
</dl>
