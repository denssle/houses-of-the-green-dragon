<script lang="ts">
	import { base } from '$app/paths';
</script>

<!--
	ENTWURF — die Angaben in [eckigen Klammern] gehören dem Betreiber, und ob der Text
	vollständig ist, gehört von jemandem geprüft, der das beurteilen darf.

	**Was hier steht, stimmt dagegen mit dem Code überein**, und das ist der Teil, den man
	nicht abschreiben kann: Es gibt kein Anmeldeprotokoll, keine dauerhaft gespeicherte
	IP-Adresse, keine Analysewerkzeuge, keine Weitergabe. Wer diesen Text ändert, ohne den
	Code zu ändern, macht ihn zur Behauptung.
-->

<h2>Datenschutzerklärung</h2>

<p>
	<i>
		Kurz vorweg: Dieses Spiel speichert das Nötigste — einen Namen, mit dem du dich anmeldest, und
		was deine Figuren in der Welt getan haben. Kein Tracking, keine Werbung, keine Dritten.
	</i>
</p>

<h3>Verantwortlich</h3>
<p>[Name und Anschrift wie im <a href="{base}/impressum" class="link">Impressum</a>]</p>

<h3>Was gespeichert wird</h3>

<h4>Dein Konto</h4>
<ul>
	<li><b>Nickname</b> — frei gewählt; er muss kein Klarname sein und sollte keiner sein.</li>
	<li>
		<b>E-Mail-Adresse</b> — <b>freiwillig</b>. Ohne sie funktioniert alles außer einer künftigen
		Passwortzurücksetzung.
	</li>
	<li>
		<b>Passwort</b> — nur als bcrypt-Hash. Das Passwort selbst wird nirgends gespeichert und kann auch
		vom Betreiber nicht gelesen werden.
	</li>
	<li><b>Zeitpunkt der Anlage und letzten Änderung</b> des Kontos.</li>
</ul>

<h4>Deine Anmeldung</h4>
<p>
	Beim Anmelden entsteht ein <b>Sitzungstoken</b>: eine Zufallszeichenfolge mit Ablaufdatum. Sie
	steht in einem Cookie und in der Datenbank; der Cookie selbst enthält keine Angaben über dich.
	Beim Abmelden wird sie gelöscht, sonst läuft sie ab.
</p>
<p>
	<small>
		Dieses Cookie ist technisch notwendig — ohne es könnte der Server nicht wissen, wer gerade
		spielt. Weitere Cookies setzt die Seite nicht, und deshalb gibt es hier auch kein Banner, das um
		Erlaubnis bittet.
	</small>
</p>

<h4>Fehlgeschlagene Anmeldeversuche</h4>
<p>
	Um Angriffe auf fremde Konten zu bremsen, merkt sich der Server nach einem Fehlversuch
	<b>IP-Adresse und Nickname</b> — ausschließlich im Arbeitsspeicher, für fünfzehn Minuten. Nach dem
	Zeitfenster oder einem Neustart ist der Eintrag fort; er wird nicht auf die Festplatte geschrieben
	und nicht ausgewertet.
</p>

<h4>Was deine Figuren tun</h4>
<p>
	Das Spiel führt eine <b>Chronik</b>: Geburten, Hochzeiten, Todesfälle, Wahlen, Bauten, Käufe. Sie
	gehört zum Spiel und ist für alle Mitspielenden sichtbar — eine Stadtgeschichte, die niemand lesen
	darf, wäre keine. Diese Einträge betreffen deine <b>Spielfiguren</b> und nicht dich; sie nennen deinen
	Nickname nicht.
</p>

<h3>Was <i>nicht</i> gespeichert wird</h3>
<ul>
	<li>Keine dauerhafte Speicherung von IP-Adressen, kein Zugriffs- oder Anmeldeprotokoll.</li>
	<li>Keine Analyse- oder Statistikwerkzeuge, kein Tracking über Seiten hinweg.</li>
	<li>Keine Werbung, keine Profilbildung, keine Weitergabe an Dritte.</li>
	<li>Keine Zahlungsdaten — es gibt nichts zu kaufen.</li>
</ul>

<h3>Wozu und auf welcher Grundlage</h3>
<p>
	Die Daten dienen allein dazu, das Spiel zu betreiben: dich anzumelden, dir deine Figuren
	zuzuordnen und die Welt am Laufen zu halten (Art. 6 Abs. 1 lit. b DSGVO — Erfüllung des
	Nutzungsverhältnisses). Das kurzzeitige Merken fehlgeschlagener Anmeldungen dient der Sicherheit
	der Konten (Art. 6 Abs. 1 lit. f DSGVO).
</p>

<h3>Wie lange</h3>
<p>
	Kontodaten bleiben, solange das Konto besteht. Sitzungstoken laufen ab oder werden beim Abmelden
	gelöscht. Sicherungskopien der Datenbank werden vierzehn Tage aufbewahrt und danach überschrieben.
</p>

<h3>Löschung — und was dabei bleibt</h3>
<p>
	Du kannst dein Konto jederzeit selbst löschen: <a href="{base}/konto" class="link"
		>unter „Konto"</a
	>. Dabei verschwinden <b>Nickname, E-Mail und Passwort</b>, und alle Sitzungen enden. Eine
	Anmeldung ist danach nicht mehr möglich.
</p>
<p>
	<b>Deine Spielfiguren bleiben in der Welt</b>, aber ohne Namen und ohne Zuordnung zu dir. Der
	Grund ist nicht Bequemlichkeit: An einer Dynastie hängen Gebäude, Ämter, Verträge und die
	Vorfahren <i>anderer</i> Spieler. Sie zu entfernen hieße, in fremde Familiengeschichten Löcher zu reißen
	und Ereignisse zu tilgen, an denen andere beteiligt waren. Was übrig bleibt, ist kein Personenbezug
	mehr, sondern ein Einwohner ohne Namen.
</p>

<h3>Deine Rechte</h3>
<p>
	Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15 bis
	21 DSGVO). Dafür genügt eine Nachricht an die im
	<a href="{base}/impressum" class="link">Impressum</a> genannte Adresse. Außerdem steht dir eine Beschwerde
	bei einer Datenschutz-Aufsichtsbehörde offen.
</p>

<h3>Hosting</h3>
<p>
	Die Seite läuft bei [Anbieter und Ort des Servers]. Dort fallen technisch bedingt Server-Logs an,
	die der Anbieter verantwortet; Näheres regelt dessen Datenschutzerklärung.
</p>
