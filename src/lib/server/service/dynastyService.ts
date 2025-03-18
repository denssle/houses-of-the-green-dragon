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
