<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<p>Dynastie {data.dynasty?.name} by {data.founder?.nickname}</p>