<script lang="ts">
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';

	/**
	 * Die Rückmeldung auf eine Handlung — an **einer** Stelle für die ganze Anwendung.
	 *
	 * **Vorher stand sie sechzehnmal da.** Jede Seite trug ihr eigenes
	 * `{#if form?.message}<p><b>…</b></p>{/if}` gleich unter der Überschrift. Drei Dinge
	 * gingen damit schief: Die Meldung erschien **oben**, während man unten auf einen Knopf
	 * gedrückt hatte — auf einer langen Gebäudeseite außerhalb des Bildes. Sie sah bei
	 * Erfolg aus wie bei einem Fehlschlag, denn beides ist nur ein Satz. Und sie blieb
	 * stehen, bis man die Seite wechselte, sodass beim nächsten Klick nicht zu erkennen
	 * war, ob dort noch die alte Antwort steht oder schon die neue.
	 *
	 * **Woher der Unterschied zwischen Erfolg und Fehlschlag kommt:** Ein `fail(400, …)`
	 * setzt den Status der Seite, ein einfaches `return { message }` lässt ihn bei 200.
	 * `applyAction` — was `use:enhance` von sich aus tut — schreibt beides nach
	 * `page.status`. Damit braucht keine der vierzig Handlungen im Server ein zusätzliches
	 * Feld: Die Unterscheidung war schon da, sie wurde nur nie angesehen.
	 */
	interface Rueckmeldung {
		id: number;
		text: string;
		schlecht: boolean;
	}

	/** Wie lange eine Meldung stehen bleibt. Ein Fehlschlag will länger gelesen werden. */
	const GUT_MS = 4000;
	const SCHLECHT_MS = 9000;

	let laufendeNummer = 0;

	function bauen(antwort: unknown, status: number): Rueckmeldung | undefined {
		const text: string | undefined = (antwort as { message?: string } | null)?.message;
		if (!text) return undefined;
		return { id: ++laufendeNummer, text, schlecht: status >= 400 };
	}

	/**
	 * **Auch ohne JavaScript.** Ohne `use:enhance` lädt das Formular die Seite neu, und die
	 * Antwort steht dann schon beim Rendern in `page.form`. Stünde die Meldung erst in
	 * einem Effekt, bekäme sie in diesem Fall niemand zu sehen — der Toast wäre eine
	 * Verbesserung, die genau dort ausfällt, wo es am wenigsten sonst noch gibt. Was ohne
	 * JavaScript fehlt, ist allein die Uhr: Die Meldung bleibt dann stehen, bis man
	 * weiterklickt.
	 */
	let aktuell: Rueckmeldung | undefined = $state(bauen(page.form, page.status));
	/**
	 * Welche Antwort schon gezeigt wurde.
	 *
	 * Ohne diese Merkung käme die Meldung wieder hoch, sobald irgendetwas anderes den
	 * Effekt erneut auslöst — `page.form` bleibt ja stehen, auch wenn der Toast längst
	 * verschwunden ist. Verglichen wird die **Kennung des Objekts**, nicht der Text: Wer
	 * zweimal dasselbe tut, soll auch zweimal dieselbe Antwort sehen.
	 */
	let gezeigt: unknown = page.form;

	function schliessen(): void {
		aktuell = undefined;
	}

	$effect(() => {
		if (page.form !== gezeigt) {
			gezeigt = page.form;
			aktuell = bauen(page.form, page.status);
		}

		// Die Uhr gehört zu der Meldung, die gerade steht — auch zu der, die schon beim
		// Rendern da war. Läuft sie ab oder kommt eine neue, räumt Svelte den Zeitgeber
		// mit dem Effekt ab, statt dass er auf eine verschwundene Meldung zeigt.
		const stehende = aktuell;
		if (!stehende) return;

		const uhr = setTimeout(
			() => {
				if (aktuell?.id === stehende.id) aktuell = undefined;
			},
			stehende.schlecht ? SCHLECHT_MS : GUT_MS
		);
		return () => clearTimeout(uhr);
	});

	/**
	 * Wer Bewegung nicht mag, bekommt keine.
	 *
	 * Ein Kasten, der von unten hereinfährt, ist für manche Menschen nicht Zierde, sondern
	 * Übelkeit. Die Meldung selbst bleibt dieselbe — nur steht sie dann sofort da.
	 */
	const ruhig: boolean =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

<!--
	**Der Bereich steht immer da, auch leer.** Ein `aria-live`-Bereich, der erst mit seiner
	Meldung entsteht, wird von Vorleseprogrammen nicht angesagt — sie müssen ihn vorher
	kennen. `polite` und nicht `assertive`: Eine Rückmeldung auf den eigenen Klick ist
	keine Warnung, die einen Satz unterbrechen dürfte.
-->
<div
	class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
	aria-live="polite"
	aria-atomic="true"
>
	{#if aktuell}
		{#key aktuell.id}
			<div
				class="pointer-events-auto flex max-w-md items-center gap-4 rounded border-l-4 bg-white px-4 py-3 shadow-lg {aktuell.schlecht
					? 'border-pink-600'
					: 'border-green-600'}"
				transition:fly={{ y: ruhig ? 0 : 16, duration: ruhig ? 0 : 150 }}
			>
				<p class="m-0">
					{#if aktuell.schlecht}
						<span class="font-semibold text-pink-700">Geht nicht:</span>
					{/if}
					{aktuell.text}
				</p>
				<button
					type="button"
					class="toast-schliessen shrink-0"
					onclick={schliessen}
					aria-label="Meldung schließen"
				>
					×
				</button>
			</div>
		{/key}
	{/if}
</div>
