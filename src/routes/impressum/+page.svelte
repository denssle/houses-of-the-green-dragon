<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	// Die E-Mail-Adresse steht bewusst nicht als zusammenhängende Zeichenkette im Markup,
	// damit sie nicht direkt aus dem ausgelieferten HTML abgegriffen werden kann. Sie wird
	// erst im Browser zusammengesetzt; ohne JavaScript bleibt die umschriebene Form stehen,
	// die für Menschen und Screenreader lesbar ist.
	//
	// Bewusst `onMount` statt `$derived`: Letzteres liefe beim SSR mit und schriebe die
	// fertige Adresse doch wieder ins ausgelieferte HTML. (Derselbe Kniff wie bei Festival.)
	const mailUser: string = 'dominik.hellweg';
	const mailHost: string = 'protonmail.com';

	let mailAddress: string | undefined = $state(undefined);

	onMount(() => {
		mailAddress = `${mailUser}@${mailHost}`;
	});
</script>

<h2>Impressum</h2>

<section>
	<h3>Angaben gemäß § 5 DDG</h3>
	<address>
		Dominik Hellweg<br />
		Preinstraße 116<br />
		44265 Dortmund<br />
		E-Mail:
		{#if mailAddress}
			<a href="mailto:{mailAddress}" class="link">{mailAddress}</a>
		{:else}
			<span>{mailUser} (at) {mailHost}</span>
		{/if}
	</address>
	<p>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: Dominik Hellweg (Anschrift wie oben).</p>
</section>

<section>
	<h3>Was diese Seite ist</h3>
	<p>
		Ein privat betriebenes Browserspiel ohne Gewinnerzielungsabsicht. Es gibt nichts zu kaufen,
		keine Werbung und keine Weitergabe von Daten zu Werbezwecken. Was gespeichert wird, steht in der
		<a href="{base}/datenschutz" class="link">Datenschutzerklärung</a>; was im Spiel gilt, in den
		<a href="{base}/regeln" class="link">Spielregeln</a>.
	</p>
</section>

<section>
	<h3>Haftung für Inhalte</h3>
	<p>
		Die Inhalte dieser Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit,
		Vollständigkeit und Aktualität kann ich jedoch keine Gewähr übernehmen. Als Diensteanbieter bin
		ich gemäß § 7 Abs. 1 DDG für eigene Inhalte nach den allgemeinen Gesetzen verantwortlich. Nach
		§§ 8 bis 10 DDG bin ich jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
		Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
		Tätigkeit hinweisen. Bei Bekanntwerden entsprechender Rechtsverletzungen entferne ich diese
		Inhalte umgehend.
	</p>
</section>

<section>
	<h3>Nutzerinhalte</h3>
	<p>
		Die Namen von Figuren, Häusern und Gebäuden stammen von den angemeldeten Spielenden. Für diese
		fremden Inhalte bin ich als Betreiber erst ab Kenntnis einer konkreten Rechtsverletzung
		verantwortlich. Hinweise nehme ich über die oben genannte E-Mail-Adresse entgegen.
	</p>
</section>

<section>
	<h3>Streitbeilegung</h3>
	<p>
		Zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle bin ich
		nicht verpflichtet und nicht bereit.
	</p>
</section>
