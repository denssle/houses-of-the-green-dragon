<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<h2>Register to have fun</h2>

<form method="POST">
	{#if !form?.success}<p>{form?.message}</p>{/if}
	<label>
		Nickname
		<input name="nickname" type="text" required />
	</label>

	<label>
		Email
		<input name="email" type="text" />
	</label>

	<label>
		Password
		<input name="password" type="password" required />
	</label>

	<label>
		Password Wiederholung
		<input name="password2" type="password" required />
	</label>

	<label>
		Name der Dynastie
		<input name="dynasty" type="text" required />
	</label>
	<button type="submit">Register</button>
</form>
