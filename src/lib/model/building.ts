import type { OwnerType } from '$lib/db/attributes/enums';

/**
 * Ein Bauwerk.
 *
 * Erbt bewusst **nicht** mehr von `BuildingTemplate`: Sonst fröre jedes Gebäude beim Bau
 * die damaligen Preise, Aktionen und Grenzen ein, und eine Balancing-Änderung erreichte
 * den Bestand nie. Was zur Vorlage gehört, holt man über `optionId` — was diesem einen
 * Haus eigen ist, steht hier.
 */
export interface Building {
	id: string;
	name: string;
	optionId: number;
	level: number;
	condition: number;
	plotId: string | null;
	ownerType: OwnerType;
	ownerCharacterId: string | null;
	forSalePrice: number | null;
	/** Der Aushang: was der Betrieb kuenftigen Angestellten bietet. */
	offeredWage: number | null;
	/** Der Auftrag: was der Eigentümer für die Instandsetzung zahlt (5.27). */
	repairWage: number | null;
}
