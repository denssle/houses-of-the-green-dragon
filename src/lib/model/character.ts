export interface Character {
	id: bigint;
	belongsTo: bigint;
	title: string;
	firstName: string;
	energy: number;
	maxEnergy: number;
	dynasty: bigint;
	money: bigint;
	age: bigint;
}
