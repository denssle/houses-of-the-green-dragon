<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<div class="flex justify-center">
	<div class="w-sm md:w-md lg:w-lg gap-4">
		<h2>Registrieren</h2>
		<p class="italic mb-4">
			Registrieren ist ein langweiliges Wort aber der erste Schritt auf einer langen Reise.
		</p>

		<form method="POST" class="">
			<section class="flex flex-col items-end">
				<label>
					Nickname
					<input name="nickname" type="text" required />
				</label>

				<label>
					Email
					<input name="email" type="text" />
				</label>

				<label>
					Passwort
					<input name="password" type="password" required />
				</label>

				<label>
					Passwort Wiederholung
					<input name="password2" type="password" required />
				</label>

				<label>
					Name der Dynastie
					<input name="dynasty" type="text" required />
				</label>
			</section>

			<section>
				{#if form?.message}
					<b>Fehler: {form?.message}</b>
				{/if}
			</section>

			<section>
				<button type="submit">Abschicken</button>
			</section>
		</form>
	</div>
</div>
