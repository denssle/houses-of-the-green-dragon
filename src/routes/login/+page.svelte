<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<div class="flex justify-center">
	<div class="w-sm md:w-md lg:w-lg gap-4">

		<h2>Anmeldung</h2>
		<p class="italic mb-4">Deine Reise geht weiter. </p>

		<form method="POST" class="">
			<section class="flex flex-col items-end">
				<label>
					Nickname
					<input name="nickname" type="text" required />
				</label>

				<label>
					Passwort
					<input name="password" type="password" required />
				</label>
			</section>

			<section>
				{#if form?.message}
					<b>{form?.message}</b>
				{/if}
			</section>

			<section>
				<button type="submit">Abschicken</button>
			</section>
		</form>
	</div>
</div>
