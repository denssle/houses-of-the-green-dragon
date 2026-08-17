<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import { MAX_NAME_LENGTH, MIN_NAME_LENGTH } from '$lib/game/naming.logic';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Seit 5.26 gibt es nur noch eine Gebäudehandlung: für Lohn herrichten.
	const BESCHRIFTUNG: Record<string, string> = { REPAIR_FOR_HIRE: 'Für Lohn herrichten' };

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
<p><i>{data.option?.description}</i></p>

{#if form?.message}
	<p><b>{form.message}</b></p>
{/if}

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
					<button type="submit">Arbeiten ({rezept.cost} AP)</button>
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
{#each data.option?.actions ?? [] as action (action)}
	<form method="POST" action="?/act" use:enhance>
		<input type="hidden" name="action" value={action} />
		<button type="submit">{BESCHRIFTUNG[action] ?? action}</button>
	</form>
{/each}

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
		Im eigenen Laden kommt die Ware aus dem Betriebslager, am Marktplatz aus der
		eigenen Kammer — deshalb stehen hier zwei verschiedene Listen zur Auswahl.
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
			<ul>
				{#each data.stock as posten (posten.itemId)}
					<li>{posten.quantity} × {posten.name}</li>
				{/each}
			</ul>
		{/if}
		{#each data.myStock as posten (posten.itemId)}
			<form method="POST" action="?/stockIn" use:enhance>
				<input type="hidden" name="itemId" value={posten.itemId} />
				<label>
					{posten.name} einlagern ({posten.quantity} in der Kammer)
					<input type="number" name="quantity" min="1" max={posten.quantity} value="1" />
				</label>
				<button type="submit">Einlagern</button>
			</form>
		{/each}
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
		{:else}
			<p><i>Hier ist nichts zu tun.</i></p>
		{/if}

		{#if data.upgradeCost !== undefined}
			<form method="POST" action="?/upgrade" use:enhance>
				<button type="submit">Ausbauen ({data.upgradeCost} Münzen)</button>
			</form>
		{:else}
			<p><i>Weiter lässt sich hier nicht ausbauen.</i></p>
		{/if}
	</section>

	<section>
		<h3>Leute</h3>
		{#if data.staff.length === 0}
			<p><i>Hier arbeitet niemand für dich.</i></p>
		{:else}
			<ul>
				{#each data.staff as person (person.id)}
					<li>
						<a href="{base}/character/{person.id}" class="link">{person.name}</a>
						— {person.wage} Münzen je Aktionspunkt
					</li>
				{/each}
			</ul>
		{/if}
		<form method="POST" action="?/hire" use:enhance>
			<label>
				Aushang: Lohn je Aktionspunkt
				<input type="number" name="wage" min="1" step="1" value={data.building.offeredWage} />
			</label>
			<button type="submit">Suchen</button>
		</form>
		<p>
			<small>
				Der Lohn kommt aus deiner Kasse. Ist sie leer, arbeitet niemand — und du merkst es daran,
				dass nichts ins Lager kommt.
			</small>
		</p>
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
