<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h2>dein aktueller Char</h2>
{data.character?.firstName} mit dem Titel {data.character?.title}