<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<h2>Login</h2>
<form method="POST">
	{#if !form?.success}<p>{form?.message}</p>{/if}
	<label>
		Nickname
		<input name="nickname" type="text" required />
	</label>

	<label>
		Password
		<input name="password" type="password" required />
	</label>
	<button type="submit">Login</button>
</form>
