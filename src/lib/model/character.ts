export interface Character {
	id: bigint;
	belongsTo: bigint;
	title: string;
	firstName: string;
	dynasty: bigint;
	money: bigint;
	age: bigint;
}
