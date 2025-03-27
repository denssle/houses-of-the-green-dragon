<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<p>{data.character?.firstName}  </p>
<p>{data.character?.age}</p>
<p>{data.character?.money}</p>

<a href="/building/new">Gebäude bauen</a>
<button>Nächste Runde</button>