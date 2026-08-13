import type { Optional } from 'sequelize';
import type { OwnerType } from '$lib/db/attributes/enums';
import type { Building } from '$lib/model/building';

/**
 * Ein Bauwerk auf einem Grundstück.
 *
 * Gespeichert wird nur, was diesem einen Haus eigen ist: `optionId` verweist auf die
 * Vorlage im Code, `level` auf die Ausbaustufe. Preise, Aktionen und Grenzen bleiben in
 * der Vorlage — sonst fröre jedes Gebäude beim Bau die damaligen Werte ein und
 * Balancing-Änderungen erreichten den Bestand nie.
 *
 * `condition` und `lastConditionTick` gehören zusammen: Der Zustand ergibt sich beim
 * Lesen aus den seither verstrichenen Ticks. Am Ende des Verfalls steht die Ruine, dann
 * verschwindet die Zeile.
 *
 * Öffentliche Gebäude sind hier keine Ausnahme, sondern nur ein anderer `ownerType` —
 * dieselben Regeln für Bau, Verfall und Renovierung, nur eine andere Kasse. `PlotId`
 * ist deshalb nullbar: Schule und Brunnen belegen ein Grundstück, eine Stadtmauer
 * umschließt die ganze Region.
 */
export interface BuildingAttributes {
	id: string;
	name: string;
	optionId: number;
	level: number;
	condition: number;
	lastConditionTick: number;
	PlotId: string | null;
	ownerType: OwnerType;
	OwnerCharacterId: string | null;
	forSalePrice: number | null;
	/** Der Aushang: was der Betrieb kuenftigen Angestellten bietet. */
	offeredWage: number | null;
}

export type BuildingCreationAttributes = Optional<
	BuildingAttributes,
	'level' | 'condition' | 'PlotId' | 'ownerType' | 'OwnerCharacterId' | 'forSalePrice'
>;

export function convertToBuilding(attributes: BuildingAttributes): Building {
	return {
		id: attributes.id,
		name: attributes.name,
		optionId: attributes.optionId,
		level: attributes.level,
		condition: attributes.condition,
		plotId: attributes.PlotId,
		ownerType: attributes.ownerType,
		ownerCharacterId: attributes.OwnerCharacterId,
		forSalePrice: attributes.forSalePrice,
		offeredWage: attributes.offeredWage
	};
}
