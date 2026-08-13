import type { Office } from '$lib/game/election.logic';

/**
 * Eine Wahl in einer Stadt.
 *
 * **Es gibt keine Ämtertabelle daneben.** Der Amtsinhaber ergibt sich aus der letzten
 * abgeschlossenen Wahl: der bestplatzierte Kandidat, der noch lebt. Damit ist die
 * Nachfolge beim Tod dieselbe Rechnung wie die Wahl selbst, und es gibt keine zweite
 * Ablage, die davon abweichen könnte.
 */
export interface ElectionAttributes {
	id: string;
	RegionId: string;
	office: Office;
	openedTick: number;
	/** Ab hier wird ausgezählt. */
	closesTick: number;
	/** Bis hierher läuft die Amtszeit des Siegers. Erst leer, dann gesetzt. */
	termEndsTick: number | null;
	closed: boolean;
}

export type ElectionCreationAttributes = ElectionAttributes;

/** Wer sich aufstellen ließ — mit der Reihenfolge, die bei Gleichstand entscheidet. */
export interface CandidacyAttributes {
	ElectionId: string;
	CharacterId: string;
	standingSinceTick: number;
}

export type CandidacyCreationAttributes = CandidacyAttributes;

/** Eine Stimme. Ein Wähler, eine Wahl, eine Stimme — der Schlüssel erzwingt es. */
export interface VoteAttributes {
	ElectionId: string;
	VoterCharacterId: string;
	CandidateCharacterId: string;
}

export type VoteCreationAttributes = VoteAttributes;
