<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<p>{data.character?.firstName} 	</p>

<button>Gebäude bauen</button>