<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import { MAX_NAME_LENGTH, MIN_NAME_LENGTH } from '$lib/game/naming.logic';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Wie viele Stellen offenstehen — die Zahl, an der der Aushang hängt. */
	const frei: number = $derived(data.hiring.positions - data.hiring.taken);

	/**
	 * Ein Haus der Stadt: Dann zahlt die Stadtkasse, und es heißt Sold statt Lohn. Wer
	 * hier entscheidet, tut es kraft Amtes und nicht kraft Eigentums — dieselbe Handlung,
	 * eine andere Tasche.
	 */
	const stadtHaus: boolean = $derived(data.building.ownerType === 'CITY');

	/**
	 * Ein Wort für den Zustand. Die Zahl steht daneben — anders als bei Zuneigung und
	 * Wesensart ist sie hier keine Verlockung, sondern die Grundlage der Entscheidung:
	 * Renovieren kostet nach dem, was fehlt.
	 */
	function zustandswort(condition: number): string {
		if (condition >= 90) return 'wie neu';
		if (condition >= 70) return 'gut in Schuss';
		if (condition >= 45) return 'in die Jahre gekommen';
		if (condition >= 20) return 'baufällig';
		return 'kurz vor dem Einsturz';
	}
</script>

<h2>{data.building.name}</h2>

<!--
	**Ein Haus hat ein Alter** (Punkt 62). „Errichtet im Herbst 71" macht aus einem
	Gebäude ein altes Gebäude; wo nichts steht, stand es schon beim Weltaufbau.
-->
<p>
	<small>
		{#if data.built}
			Errichtet im {data.built.season} {data.built.year}.
		{:else}
			Steht hier, solange die Stadt steht.
		{/if}
	</small>
</p>
<p><i>{data.option?.description}</i></p>

<dl>
	{#if data.plot}
		<dt>Lage</dt>
		<dd>{data.plot.address}</dd>
	{/if}

	<dt>Zustand</dt>
	<dd>{data.building.condition} von 100 — {zustandswort(data.building.condition)}</dd>

	<dt>Ausbaustufe</dt>
	<dd>
		{data.levelName ?? data.building.level}
		<small>(Stufe {data.building.level} von {data.maxLevel})</small>

		<!--
			**Der Ausbau steht dort, wo die Stufe steht.** Der Knopf gab es schon, aber unten
			unter „Instandhaltung", zwischen Renovieren und Reparaturauftrag — dort sucht ihn
			niemand, der wissen will, was aus seiner Kate werden kann. Und was er brachte,
			stand nirgends.
		-->
		{#if data.upgrade}
			<p>
				<small>
					Als <b>{data.upgrade.name}</b>:
					{#if data.upgrade.residents > data.upgrade.residentsNow}
						Platz für {data.upgrade.residents} statt {data.upgrade.residentsNow}.
					{/if}
					{#if data.upgrade.rest > data.upgrade.restNow}
						Wer hier wohnt, sammelt {data.upgrade.rest} Aktionspunkte Vorrat statt
						{data.upgrade.restNow}.
					{/if}
					{#if data.upgrade.crafts && data.upgrade.output > data.upgrade.outputNow}
						Jeder Durchgang bringt {data.upgrade.output} statt {data.upgrade.outputNow} Prozent.
					{/if}
					{#if data.upgrade.wage > data.upgrade.wageNow}
						{data.upgrade.wage} statt {data.upgrade.wageNow} Münzen je Aktionspunkt.
					{/if}
				</small>
			</p>
			<p>
				<small>
					Kostet {data.upgrade.price} Münzen und {data.upgrade.actionPoints} Aktionspunkte.
					{#if data.upgrade.surcharge}
						<i>
							Im {data.upgrade.surcharge} liegt der Bau schwerer — sonst wären es
							{data.upgrade.basePrice}.
						</i>
					{/if}
				</small>
			</p>
			{#if data.mine}
				<form method="POST" action="?/upgrade" use:enhance class="actions">
					<button type="submit">Ausbauen</button>
				</form>
			{/if}
		{:else}
			<p><small><i>Weiter lässt sich hier nicht ausbauen.</i></small></p>
		{/if}
	</dd>

	{#if data.building.forSalePrice !== null}
		<dt>Zu verkaufen</dt>
		<dd>{data.building.forSalePrice} Münzen, samt Grundstück</dd>
	{/if}

	{#if data.freeRoom !== null}
		<dt>Wohnraum</dt>
		<dd>
			{#if data.livesHere}<b>Hier wohnst du.</b>{/if}
			{data.freeRoom === 0 ? 'kein Platz mehr frei' : `noch ${data.freeRoom} Platz frei`}
		</dd>
	{/if}
</dl>

<!--
	Einziehen kann, wem das Haus gehört oder für wen die Stadt es gebaut hat. Bis 5.6 gab
	es diesen Weg nur für NPCs — ein Spieler ohne eigenes Haus blieb obdachlos, und das
	heißt: keine Erholung, keine Kinder.
-->
{#if data.canMoveIn}
	<form method="POST" action="?/moveIn" use:enhance class="actions">
		<button type="submit">Hier einziehen</button>
	</form>
{/if}

<!--
	Der Name gehört dem Eigentümer. Über städtische Bauten verfügt auch der Bürgermeister
	nicht — ihr Name ist der der Stadt.
-->
{#if data.mine}
	<form method="POST" action="?/rename" use:enhance class="actions">
		<input
			type="text"
			name="name"
			value={data.building.name}
			required
			minlength={MIN_NAME_LENGTH}
			maxlength={MAX_NAME_LENGTH}
			aria-label="Name des Hauses"
		/>
		<button type="submit">Umbenennen</button>
	</form>
{/if}

{#if data.recipes.length > 0}
	<section>
		<h3>Herstellen</h3>
		{#each data.recipes as rezept (rezept.itemId)}
			<div>
				<i>
					{rezept.input.map((z) => `${z.quantity} × ${z.name}`).join(', ')} → {rezept.output}
				</i>
				<form method="POST" action="?/craft" use:enhance>
					<input type="hidden" name="itemId" value={rezept.itemId} />
					<!--
						**Nicht „Arbeiten"** (Punkt 53): Auf derselben Seite stand ein zweiter Knopf
						fast gleichen Namens, der etwas anderes tut — die Schicht für fremde
						Rechnung. Für einen Neuling war der hier der sichtbarere und der falsche.
					-->
					<button type="submit">Herstellen ({rezept.cost} AP)</button>
				</form>
			</div>
		{/each}
		<p>
			<small>
				Aus eigenem Vorrat und aus dem Betriebslager, auf eigene Rechnung. Wer für dich arbeitet,
				produziert dagegen ins Lager.
			</small>
		</p>
	</section>
{/if}
<!--
	**Die Instandsetzung hängt nicht an der Vorlage, sondern am Zustand** (5.26). Ein
	städtischer Bau bietet Arbeit, solange er nicht in voller Güte steht — das lässt sich
	nicht in `actions` schreiben, denn dieselbe Vorlage bietet heute Arbeit und morgen
	nicht.

	Ohne diesen Knopf könnten nur NPCs die Arbeit annehmen, und das wäre ein zweiter Satz
	Regeln für die Simulation — genau das, was `npcService` ausdrücklich vermeidet.
-->
{#if data.repairForHire}
	<form method="POST" action="?/act" use:enhance>
		<input type="hidden" name="action" value="REPAIR_FOR_HIRE" />
		<button type="submit">Für Lohn herrichten</button>
	</form>
	<p>
		<small>
			Die Stadt zahlt für jeden Handschlag an ihren Bauten — solange etwas zu richten ist und die
			Kasse es hergibt.
		</small>
	</p>
{/if}

<section>
	<h3>{data.isMarket ? 'Stände' : 'Zu haben'}</h3>
	{#if data.offers.length === 0}
		<p><i>Hier hängt gerade kein Preisschild.</i></p>
	{:else}
		<ul>
			{#each data.offers as angebot (angebot.id)}
				<li>
					{angebot.quantity} × {angebot.itemName} für {angebot.pricePerUnit} Münzen
					<small>
						— <a href="{base}/character/{angebot.sellerId}" class="link">{angebot.sellerName}</a>
					</small>
					{#if !angebot.mine}
						<form method="POST" action="?/buyOffer" use:enhance>
							<input type="hidden" name="offerId" value={angebot.id} />
							<input type="number" name="quantity" min="1" max={angebot.quantity} value="1" />
							<button type="submit">Kaufen</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<!--
		Im eigenen Laden kommt die Ware aus dem Betriebslager, am Marktplatz aus dem
		eigenen Inventar — deshalb stehen hier zwei verschiedene Listen zur Auswahl.
	-->
	{#if data.isMarket || data.mine}
		{@const quelle = data.isMarket ? data.myStock : data.stock}
		{#if quelle.length === 0}
			<p>
				<i>
					{data.isMarket
						? 'Du hast nichts dabei, was du anbieten könntest.'
						: 'Das Lager ist leer — leg erst etwas hinein.'}
				</i>
			</p>
		{:else}
			{#each quelle as posten (posten.itemId)}
				<form method="POST" action="?/sellOffer" use:enhance>
					<input type="hidden" name="itemId" value={posten.itemId} />
					<label>
						{posten.name} ({posten.quantity} da), Menge
						<input type="number" name="quantity" min="1" max={posten.quantity} value="1" />
					</label>
					<label>
						zu je
						<input type="number" name="price" min="0" step="1" value="5" />
					</label>
					<button type="submit">
						Anbieten{data.isMarket ? ` (${data.stallFee} Münzen Standgeld)` : ''}
					</button>
				</form>
			{/each}
		{/if}
	{/if}
</section>

{#if data.mine}
	<section>
		<h3>Betriebslager</h3>
		{#if data.stock.length === 0}
			<p><i>Nichts eingelagert.</i></p>
		{:else}
			<!--
				**Der Weg zurück** (5.34): Bis hierher führte er nur hinein. Das Lager fasst
				unbegrenzt, das Inventar nicht — wer etwas essen, anziehen oder am Marktplatz
				anbieten will, muss es wieder bei sich haben.
			-->
			<ul>
				{#each data.stock as posten (posten.itemId)}
					<li>
						{posten.quantity} × {posten.name}
						<form method="POST" action="?/stockOut" use:enhance>
							<input type="hidden" name="itemId" value={posten.itemId} />
							<input
								type="number"
								name="quantity"
								min="1"
								max={posten.quantity}
								value="1"
								aria-label="Wie viel {posten.name} herausnehmen"
							/>
							<button type="submit">Herausnehmen</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		{#each data.myStock as posten (posten.itemId)}
			<form method="POST" action="?/stockIn" use:enhance>
				<input type="hidden" name="itemId" value={posten.itemId} />
				<label>
					{posten.name} einlagern ({posten.quantity} im Inventar)
					<input type="number" name="quantity" min="1" max={posten.quantity} value="1" />
				</label>
				<button type="submit">Einlagern</button>
			</form>
		{/each}
		<p>
			<small>
				Im Inventar liegen {data.inventory.used} von {data.inventory.capacity} Stück. Was hier im Lager
				liegt, zählt nicht dagegen — ein Lager fasst, so viel man hineinträgt.
			</small>
		</p>
	</section>

	<section>
		<h3>Instandhaltung</h3>
		{#if data.building.condition < 100}
			<form method="POST" action="?/renovate" use:enhance>
				<button type="submit">
					Renovieren ({data.renovationCost} Münzen{#each data.renovationMaterial as posten (posten.itemId)}
						und {posten.quantity}
						{posten.name}{/each})
				</button>
			</form>
			<p>
				<small>Wer früh renoviert, zahlt wenig — gezahlt wird nach dem, was fehlt.</small>
			</p>

			<!--
				**Oder man lässt richten** (5.27): Wer die Aktionspunkte, das Material oder das
				Können nicht hat, bietet Lohn und wartet, bis jemand kommt. Ein leeres Feld nimmt
				den Auftrag wieder ab.
			-->
			<form method="POST" action="?/offerRepair" use:enhance>
				<label>
					Auftrag: Lohn je Handschlag
					<input type="number" name="wage" min="1" step="1" value={data.building.repairWage} />
				</label>
				<button type="submit">
					{data.building.repairWage === null ? 'Ausschreiben' : 'Lohn ändern'}
				</button>
			</form>
			{#if data.building.repairWage !== null}
				<p>
					<small>
						Ausgeschrieben: {data.building.repairWage} Münzen je Handschlag.
					</small>
				</p>
				<!-- Dasselbe wie beim Aushang: Zurückziehen war möglich, aber unsichtbar. -->
				<form method="POST" action="?/offerRepair" use:enhance>
					<button type="submit" class="link">Auftrag zurückziehen</button>
				</form>
			{/if}
		{:else}
			<p><i>Hier ist nichts zu tun.</i></p>
		{/if}
	</section>

	<section>
		<h3>Verkaufen</h3>
		<form method="POST" action="?/sell" use:enhance>
			<label>
				Preis
				<input type="number" name="price" min="0" step="1" value={data.building.forSalePrice} />
			</label>
			<button type="submit">Preisschild anhängen</button>
		</form>
		{#if data.building.forSalePrice !== null}
			<form method="POST" action="?/sell" use:enhance>
				<button type="submit" class="link">Doch nicht verkaufen</button>
			</form>
		{/if}
	</section>
{:else if data.building.forSalePrice !== null}
	<section>
		<h3>Zu haben</h3>
		<form method="POST" action="?/buy" use:enhance>
			<button type="submit">Kaufen für {data.building.forSalePrice} Münzen</button>
		</form>
	</section>
{/if}

<!--
	**Leute — und zwar für jeden, der hier bestimmen darf.** Der Abschnitt stand bis 5.37
	im Block „gehört mir", und damit war die Anzeige enger als die Handlung dahinter:
	`darfBestimmen` im Anstellungsdienst lässt den Amtsinhaber über die Häuser der Stadt
	entscheiden, aber ein gewählter Bürgermeister fand keinen Knopf, um die Wache zu
	besetzen. Ein städtisches Haus hat keinen Eigentümer; wer die Frage nach dem Eigentum
	stellt, schließt die Stadt für immer aus.

	**Und nur dort, wo Arbeit möglich ist.** Ein Wohnhaus hat keine Stelle und wird nie
	eine haben; ein Abschnitt „Leute" unter jeder Kate und jedem Rathaus wäre eine
	Überschrift ohne Inhalt. Bleibt er stehen, solange noch jemand angestellt ist — sonst
	verschwände mit der letzten Stufe auch der Knopf zum Entlassen.
-->
{#if data.hiring.mayDecide && (data.hiring.positions > 0 || data.staff.length > 0)}
	<section>
		<h3>Leute</h3>
		{#if data.staff.length === 0}
			<p>
				<i>
					{stadtHaus
						? 'Hier steht niemand im Dienst der Stadt.'
						: 'Hier arbeitet niemand für dich.'}
				</i>
			</p>
		{:else}
			<ul>
				{#each data.staff as person (person.id)}
					<li>
						<a href="{base}/character/{person.id}" class="link">{person.name}</a>
						— {person.wage} Münzen je Aktionspunkt
						<form method="POST" action="?/dismiss" use:enhance>
							<input type="hidden" name="employeeId" value={person.id} />
							<button type="submit" class="link">Entlassen</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		<!--
			**Was der Aushang gerade tut, steht über dem Feld.** Vorher stand dort ein
			Zahlenfeld mit einem Knopf „Suchen": Ob ein Aushang hängt, war nur am
			vorausgefüllten Wert zu erraten, wie viele Stellen das Haus hat, an keiner
			Stelle — und wer ihn wieder abnehmen wollte, musste ahnen, dass ein leeres Feld
			das tut.
		-->
		<p>
			{#if data.hiring.positions === 0}
				<i>Hier ist kein Arbeitsplatz — dieses Haus stellt niemanden ein.</i>
			{:else if data.building.offeredWage === null}
				Kein Aushang. {frei} von {data.hiring.positions}
				{data.hiring.positions === 1 ? 'Stelle' : 'Stellen'} unbesetzt.
			{:else}
				<b>
					Es hängt ein Aushang: {data.building.offeredWage} Münzen je Aktionspunkt.
				</b>
				{#if frei > 0}
					{frei} von {data.hiring.positions}
					{data.hiring.positions === 1 ? 'Stelle' : 'Stellen'} frei — eine Schicht kostet
					{stadtHaus ? 'die Stadt' : 'dich'}
					{data.building.offeredWage * data.hiring.actionPointCost} Münzen.
				{:else}
					Alle {data.hiring.positions} Stellen sind besetzt; es meldet sich niemand mehr.
				{/if}
			{/if}
		</p>
		{#if data.hiring.positions > 0}
			<form method="POST" action="?/hire" use:enhance>
				<label>
					Aushang: {stadtHaus ? 'Sold' : 'Lohn'} je Aktionspunkt
					<input type="number" name="wage" min="1" step="1" value={data.building.offeredWage} />
				</label>
				<button type="submit">
					{data.building.offeredWage === null ? 'Aushängen' : 'Lohn ändern'}
				</button>
			</form>
			{#if data.building.offeredWage !== null}
				<!--
					Das Gegenstück, das es serverseitig immer gab (`wage = null`) und in der
					Anzeige nie: derselbe Weg wie „Doch nicht verkaufen" beim Preisschild — ein
					Formular ohne Feld.
				-->
				<form method="POST" action="?/hire" use:enhance>
					<button type="submit" class="link">Aushang abnehmen</button>
				</form>
			{/if}
		{/if}
		<p>
			<small>
				{#if stadtHaus}
					Der Sold kommt aus der Stadtkasse{#if data.hiring.purse}
						, und darin liegen {data.hiring.purse.money} Münzen{/if}. Ist sie leer, tritt niemand
					seinen Dienst an.
				{:else}
					Der Lohn kommt aus deiner Kasse{#if data.hiring.purse}
						, und darin liegen {data.hiring.purse.money} Münzen{/if}. Ist sie leer, arbeitet niemand
					— und du merkst es daran, dass nichts ins Lager kommt.
				{/if}
				Fehlt dagegen das Material, wird trotzdem gezahlt: Für Arbeit zu sorgen ist Sache des Arbeitgebers,
				nicht die der Angestellten. Wer geht, geht sofort — für beide Seiten. Den Aushang abzunehmen
				entlässt niemanden; es kommt nur keiner mehr dazu.
			</small>
		</p>
	</section>
{/if}

{#if data.school}
	<section>
		<h3>Unterricht</h3>
		{#if data.school.teachers.length === 0}
			<p>
				<i>
					Niemand unterrichtet hier. Eine Schule ohne Lehrer ist ein leeres Haus — der Bürgermeister
					müsste eine Stelle ausschreiben.
				</i>
			</p>
		{:else if data.school.children.length === 0}
			<p><i>Du hast keine Kinder, die hier lernen könnten.</i></p>
		{:else}
			<p>
				Ein Schultag kostet {data.school.fee}
				{data.school.fee === 1 ? 'Münze' : 'Münzen'} Schulgeld
				{#if data.school.fee === 0}<i>— die Stadt zahlt</i>{/if} und einen Teil der Kraft deines Kindes.
			</p>
			{#each data.school.teachers as lehrer (lehrer.characterId + lehrer.skill)}
				<!--
					Der Lehrer steht außerhalb des `label`: Ein Verweis darin wäre nur schwer
					anzuklicken, weil ein Klick aufs Label zum Auswahlfeld springt.
				-->
				<form method="POST" action="?/school" use:enhance>
					<input type="hidden" name="skill" value={lehrer.skill} />
					{lehrer.skillName} bei
					<a href="{base}/character/{lehrer.characterId}" class="link">{lehrer.name}</a>
					(bis Stufe {lehrer.upTo}) —
					<select name="childId" aria-label="Kind für {lehrer.skillName}">
						{#each data.school.children as kind (kind.id)}
							<option value={kind.id}>{kind.firstName}, {kind.age} Jahre</option>
						{/each}
					</select>
					<button type="submit">Hinschicken</button>
				</form>
			{/each}
		{/if}
		<p>
			<small>
				Was ein Kind hier lernt, kann ihm niemand nehmen — und es zahlt sich erst aus, wenn es
				erwachsen ist. Wer sein Kind lernen lässt, verzichtet solange auf dessen Hände.
			</small>
		</p>
	</section>
{/if}
