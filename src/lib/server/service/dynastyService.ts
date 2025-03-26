import type { Dynasty } from '$lib/model/dynasty';

const dynastyMap: Map<number, Dynasty> = new Map();

export function create(name: string, userId: number): void {
	const newDynasty: Dynasty = {
		id: Date.now(),
		name: name,
		foundedBy: userId
	};
	dynastyMap.set(newDynasty.id, newDynasty);
}


export function getDynastyForUser(userIDd: number): Dynasty | undefined {
	return dynastyMap.values().find(value => value.foundedBy === userIDd);
}