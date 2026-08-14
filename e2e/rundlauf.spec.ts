import { expect, test, type Page } from '@playwright/test';

/**
 * Ein Weg durch das Spiel, von der Anmeldung bis zum eigenen Grundstück.
 *
 * **Eine Geschichte statt vieler Fälle.** Die Prüfungen bauen aufeinander auf: Wer sich
 * nicht registrieren kann, braucht keinen Charakter, und wer keinen Charakter hat, kauft
 * kein Grundstück. Deshalb `serial` — bricht ein Schritt, sind die folgenden ohnehin
 * sinnlos, und ihre Meldungen verdeckten nur die eine, auf die es ankommt.
 *
 * Geprüft wird nicht die Spielregel, sondern der **Weg dorthin**: dass Formulare ankommen,
 * Verweise irgendwohin führen und Seiten zeigen, was sie zeigen sollen. Die Regeln stehen
 * in den Unit-Tests — und die hätten keinen der Fehler gefunden, die beim Durchspielen von
 * Hand auffielen.
 *
 * Beim Schreiben dieses Tests fielen schon drei falsche Annahmen auf: Das Feld heißt „Name
 * der Dynastie" und nicht „Name des Hauses", die Registrierung will das Passwort zweimal,
 * und Tagelöhnerei gibt es nicht auf der Arbeitsseite, sondern in der städtischen Schmiede.
 */

/** Jeder Lauf braucht einen eigenen Namen — die Welt ist frisch, das Konto neu. */
const NICKNAME = `pruefer_${Date.now().toString(36)}`;
const PASSWORT = 'ein-hinreichend-langes-testpasswort';
const DYNASTIE = 'Haus Rundlauf';
const CHARAKTER = 'Wenzel';

/** Die App läuft unter einem Unterpfad (siehe svelte.config.js). */
const BASIS = '/houses';

/**
 * Eine Schicht in der städtischen Schmiede — der Weg, den ein Neuling nimmt.
 *
 * Nach dem Klick wird auf die Gebäudeseite **gewartet**: `count()` fragt sofort und hätte
 * sonst gezählt, was noch gar nicht geladen ist. Das ist der Unterschied zwischen einer
 * Prüfung, die wartet (`expect`), und einer, die nur nachsieht.
 */
async function eineSchicht(page: Page): Promise<boolean> {
	await page.goto(BASIS + '/');
	const schmiede = page.getByRole('link', { name: 'Städtische Schmiede' });
	if ((await schmiede.count()) === 0) return false;

	await schmiede.first().click();
	await page.waitForURL(/\/building\//);

	// **Genau dieser Knopf.** Auf der Seite steht daneben „Arbeiten (1 AP)" — das ist das
	// Herstellen aus eigenem Vorrat und scheitert ohne Erz. Die Tagelöhnerei heißt bloß
	// „Arbeiten". Dass die beiden sich so ähnlich sehen, ist ein Fund für sich.
	const arbeiten = page.getByRole('button', { name: 'Arbeiten', exact: true });
	if (!(await arbeiten.first().isVisible())) return false;
	await arbeiten.first().click();
	return true;
}

test.describe.serial('Ein Leben von vorn', () => {
	/**
	 * **Eine Seite für alle Schritte.** Playwright gibt jedem Test sonst einen frischen
	 * Browser-Kontext — und damit ginge der Anmeldecookie aus dem ersten Schritt verloren.
	 * Für eine Geschichte, die aufeinander aufbaut, ist das falsch herum: Ein Spieler
	 * meldet sich einmal an und bleibt es.
	 */
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
	});

	test.afterAll(async () => {
		await page.close();
	});
	test('registriert ein Konto samt Haus', async () => {
		await page.goto(BASIS + '/register');
		await page.getByLabel('Nickname').fill(NICKNAME);
		await page.getByLabel('Passwort', { exact: true }).fill(PASSWORT);
		await page.getByLabel('Passwort Wiederholung').fill(PASSWORT);
		await page.getByLabel('Name der Dynastie').fill(DYNASTIE);
		await page.getByRole('button', { name: 'Abschicken' }).click();

		// Konto und Haus entstehen in einem Zug, und man ist angemeldet — die Übersicht
		// weist von dort auf den einen Weg, der noch offen ist.
		await expect(page.getByText('Noch lebt niemand von dir in dieser Stadt.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Charakter anlegen' })).toBeVisible();
	});

	test('legt einen Charakter an', async () => {
		await page.goto(BASIS + '/character/new');
		await page.getByLabel('Vorname').fill(CHARAKTER);
		await page.getByRole('radio', { name: 'männlich' }).check();
		await page.getByRole('button', { name: 'Erstellen' }).click();

		await expect(page.getByRole('heading', { name: CHARAKTER })).toBeVisible();
		// Seit 5.6 beginnt niemand im Freien, solange die Stadt Platz hat.
		await expect(page.getByText('ohne Dach über dem Kopf')).toHaveCount(0);
	});

	test('zeigt die Stadt mit ihren Wegen', async () => {
		await page.goto(BASIS + '/');

		await expect(page.getByRole('heading', { name: 'Grünau' })).toBeVisible();
		// In den Handlungsleisten und nicht irgendwo auf der Seite: „Rathaus" steht auch
		// im Verzeichnis der Häuser, und beides ist richtig.
		for (const weg of ['Arbeit', 'Umland', 'Kornspeicher', 'Markt', 'Grundstücke', 'Rathaus']) {
			await expect(
				page.locator('.actions').getByRole('link', { name: weg, exact: true })
			).toBeVisible();
		}
	});

	test('führt von einem Namen zu der Person, die er meint', async () => {
		// Der Fehler aus 4.17: Die Route las ihren Parameter nicht und zeigte immer den
		// eigenen Charakter — alle Verweise führten auf einen selbst.
		await page.goto(BASIS + '/people');
		const ersterName = page.locator('.entries a.link').first();
		const name = ((await ersterName.textContent()) ?? '').trim();
		await ersterName.click();

		await expect(page.getByRole('heading', { name })).toBeVisible();
		expect(name).not.toBe(CHARAKTER);
		// Was in fremder Truhe liegt, geht niemanden an.
		await expect(page.getByText('Aktionspunkte')).toHaveCount(0);
	});

	test('lässt eine Schicht arbeiten', async () => {
		expect(await eineSchicht(page)).toBe(true);

		await expect(page.getByText(/Feierabend/)).toBeVisible();
	});

	test('kauft von verdientem Geld ein Grundstück', async () => {
		// Über die Oberfläche und nicht über die Datenbank: Der Test soll denselben Weg
		// gehen wie ein Spieler. Vierzig Schichten reichen für ein Grundstück.
		for (let i = 0; i < 40; i++) {
			if (!(await eineSchicht(page))) break;
		}

		await page.goto(BASIS + '/plot');
		await page.getByRole('button', { name: 'Kaufen' }).first().click();

		await expect(page.getByText('Dir gehört noch kein Fleckchen Erde.')).toHaveCount(0);
	});

	test('hält fest, was geschehen ist', async () => {
		await page.goto(BASIS + '/chronicle?view=me');

		await expect(page.getByRole('heading', { name: /Chronik/ })).toBeVisible();
		// Der Grundstückskauf steht seit 5.3 im Lebenslauf.
		await expect(page.getByText(/gekauft/).first()).toBeVisible();
	});

	test('meldet ab und lässt die Chronik trotzdem offen', async () => {
		await page.goto(BASIS + '/');
		await page.getByRole('button', { name: 'Abmelden' }).click();
		await expect(page).toHaveURL(/login/);

		// Die Stadtchronik ist das Schaufenster der Welt und steht Gästen offen.
		await page.goto(BASIS + '/chronicle');
		await expect(page.getByRole('heading', { name: /Chronik/ })).toBeVisible();
		// Für Gäste ohne Verweise: Ein Link, der auf die Anmeldung führt, wäre ein
		// Versprechen, das die Seite bricht.
		await expect(page.locator('li a.link')).toHaveCount(0);
	});
});
