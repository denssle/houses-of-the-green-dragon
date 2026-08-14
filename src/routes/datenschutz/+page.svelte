<script lang="ts">
	import { base } from '$app/paths';
</script>

<!--
	Aufbau und Formulierungen folgen der Datenschutzerklärung von Festival — dasselbe
	Vorgehen, derselbe Hoster, derselbe Verantwortliche.

	**Übertragen und nicht abgeschrieben**: Die Datenlage ist hier eine andere. Es gibt
	keine Profilbilder, keine Kommentare und keine Freundschaften — dafür eine Chronik, die
	auch Gästen offensteht, und eine Löschung, die anonymisiert statt zu löschen. Beides
	steht unten ausdrücklich.

	Wer diesen Text ändert, ohne den Code zu ändern, macht ihn zur Behauptung.
-->

<h2>Datenschutzerklärung</h2>

<section>
	<h3>Verantwortlicher</h3>
	<p>
		Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Seite ist Dominik
		Hellweg. Anschrift und Kontaktmöglichkeit stehen im
		<a href="{base}/impressum" class="link">Impressum</a>.
	</p>
	<p>
		Dies ist ein privates, nicht kommerzielles Browserspiel. Es findet weder Werbung noch Tracking
		noch eine Weitergabe von Daten zu Werbezwecken statt.
	</p>
</section>

<section>
	<h3>Welche Daten verarbeitet werden</h3>
	<p>Das Spiel setzt ein Benutzerkonto voraus. Gespeichert werden dabei:</p>
	<ul>
		<li>
			<b>Kontodaten:</b> Nickname (Pflichtangabe, dient der Anmeldung) sowie — freiwillig — eine E-Mail-Adresse.
			Das Passwort wird ausschließlich als bcrypt-Hash gespeichert, nie im Klartext.
		</li>
		<li>
			<b>Sitzungsdaten:</b> ein zufälliger Token mit Ablaufdatum, der die Anmeldung aufrechterhält.
		</li>
		<li>
			<b>Spielstand:</b> alles, was deine Figuren in der Welt sind und tun — Namen, Alter, Verwandtschaft,
			Besitz, Fertigkeiten, Ämter, Beziehungen zu anderen Figuren.
		</li>
		<li>
			<b>Chronik:</b> was in der Stadt geschehen ist — Geburten, Hochzeiten, Todesfälle, Wahlen, Bauten,
			Käufe, jeweils mit Zeitpunkt und den beteiligten Figuren.
		</li>
	</ul>
	<p>
		Zu allen genannten Datensätzen werden technisch bedingt Erstellungs- und Änderungszeitpunkt
		gespeichert. Eine automatisierte Entscheidungsfindung oder ein Profiling findet nicht statt.
	</p>
	<p>
		<small>
			Spielstand und Chronik betreffen deine <b>Figuren</b>, nicht dich: Sie nennen deinen Nickname
			nicht, und aus ihnen geht nicht hervor, wer hinter einem Haus steht.
		</small>
	</p>
</section>

<section>
	<h3>Zweck und Rechtsgrundlage</h3>
	<p>
		Sämtliche Daten dienen allein dem Betrieb des Spiels: der Anmeldung, der Zuordnung deiner
		Figuren und dem Lauf der Welt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des
		Nutzungsverhältnisses) für Konto- und Spieldaten sowie Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
		Interesse an einem funktionsfähigen und missbrauchssicheren Betrieb) für Sitzungsdaten und
		Server-Protokolle. Die freiwillige E-Mail-Adresse beruht auf Art. 6 Abs. 1 lit. a DSGVO
		(Einwilligung).
	</p>
</section>

<section>
	<h3>Was andere sehen</h3>
	<p>
		Angemeldete Mitspielende sehen die Figuren der anderen: Alter, Aufenthalt, Familie, Wohnhaus,
		Besitz, Können und ihren Lebenslauf. Nicht sichtbar sind Geld, Aktionspunkte und der Zustand
		einer Figur — und in keinem Fall dein Nickname oder deine E-Mail-Adresse.
	</p>
	<p>
		<b>Die Stadtchronik steht auch ohne Anmeldung offen.</b> Sie ist das Schaufenster der Welt: Wer hereinschaut,
		soll sehen, dass hier etwas geschieht, bevor er sich für ein Konto entscheidet. Dort stehen die Namen
		von Spielfiguren — nicht die von Menschen.
	</p>
</section>

<section>
	<h3>Cookies</h3>
	<p>
		Es wird ein einziges technisch notwendiges Cookie gesetzt (<code>session</code>). Es enthält
		keinen Namen und keine Spieldaten, sondern nur einen zufälligen Token, über den die Sitzung
		serverseitig zugeordnet wird. Das Cookie läuft spätestens nach 30 Tagen ab und wird beim
		Abmelden gelöscht. Es gibt keine Analyse-, Werbe- oder Drittanbieter-Cookies; eine Einwilligung
		ist dafür nach § 25 Abs. 2 TDDDG nicht erforderlich.
	</p>
</section>

<section>
	<h3>Server-Protokolle und Missbrauchsschutz</h3>
	<p>
		Beim Aufruf der Seite fallen beim Hoster technische Protokolldaten an (unter anderem IP-Adresse,
		Zeitpunkt, aufgerufene Adresse, Browsertyp). Sie dienen dem sicheren Betrieb und der
		Fehlersuche.
	</p>
	<p>
		Zum Schutz vor dem automatisierten Durchprobieren von Passwörtern wird bei fehlgeschlagenen
		Anmeldeversuchen die IP-Adresse zusammen mit dem verwendeten Nickname für 15 Minuten im
		Arbeitsspeicher des Servers vorgehalten. Diese Angaben werden nicht in der Datenbank gespeichert
		und verfallen automatisch.
	</p>
</section>

<section>
	<h3>Hosting</h3>
	<p>
		Die Anwendung wird bei der uberspace.de GmbH (Sonnenberger Straße 16, 65193 Wiesbaden)
		betrieben. Der Hoster verarbeitet die Daten ausschließlich weisungsgebunden als
		Auftragsverarbeiter nach Art. 28 DSGVO. Die Server stehen in Deutschland; eine Übermittlung in
		Drittländer findet nicht statt.
	</p>
</section>

<section>
	<h3>Speicherdauer</h3>
	<p>
		Kontodaten bleiben gespeichert, solange das Benutzerkonto besteht. Sitzungstoken verfallen
		spätestens nach 30 Tagen oder werden beim Abmelden gelöscht. Sicherungskopien der Datenbank
		werden vierzehn Tage aufbewahrt und danach überschrieben. Zur Löschdauer der Server-Protokolle
		gelten die Fristen des Hosters.
	</p>
</section>

<section>
	<h3>Löschung — und was dabei bleibt</h3>
	<p>
		Das Konto lässt sich jederzeit selbst löschen (<a href="{base}/konto" class="link"
			>unter „Konto"</a
		>). Dabei verschwinden <b>Nickname, E-Mail-Adresse und Passwort</b>, und alle Sitzungen enden.
		Eine Anmeldung ist danach nicht mehr möglich.
	</p>
	<p>
		<b>Die Spielfiguren bleiben in der Welt</b> — ohne Namen und ohne Zuordnung zu einer Person. Sie
		heißen fortan „Namenlos", das Haus „Ein vergessenes Haus", und niemand spielt sie mehr; sie wohnen,
		arbeiten und sterben wie jeder andere Einwohner.
	</p>
	<p>
		<small>
			Der Grund ist nicht Bequemlichkeit. An einer Dynastie hängen Gebäude, Ämter, Verträge und die
			Vorfahren <i>anderer</i> Spielender. Sie zu entfernen hieße, in fremde Familiengeschichten Löcher
			zu reißen und Ereignisse zu tilgen, an denen andere beteiligt waren. Was übrig bleibt, ist kein
			Personenbezug mehr, sondern ein Einwohner ohne Namen — und genau das ist der Zweck der Anonymisierung.
		</small>
	</p>
</section>

<section>
	<h3>Rechte der betroffenen Personen</h3>
	<p>
		Es besteht das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17),
		Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen
		Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Erteilte Einwilligungen können
		jederzeit mit Wirkung für die Zukunft widerrufen werden; die Rechtmäßigkeit der bis dahin
		erfolgten Verarbeitung bleibt unberührt.
	</p>
	<p>
		Das wichtigste dieser Rechte lässt sich unmittelbar im Spiel ausüben: Das gesamte Konto lässt
		sich <a href="{base}/konto" class="link">unter „Konto"</a> selbst entfernen — ohne Umweg über
		eine Anfrage. Für alles Weitere, etwa eine Auskunft nach Art. 15 DSGVO, genügt eine Nachricht an
		die im <a href="{base}/impressum" class="link">Impressum</a> genannte Adresse.
	</p>
	<p>
		Zudem besteht ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde; für den
		Verantwortlichen zuständig ist die Landesbeauftragte für Datenschutz und Informationsfreiheit
		Nordrhein-Westfalen.
	</p>
</section>

<section>
	<h3>Datensicherheit</h3>
	<p>
		Die Übertragung erfolgt verschlüsselt über HTTPS. Passwörter werden ausschließlich als Hash
		gespeichert. Ein lückenloser Schutz von Daten bei der Übertragung im Internet ist gleichwohl
		nicht möglich.
	</p>
</section>
