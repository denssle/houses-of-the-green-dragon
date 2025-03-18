import type { Dynasty } from '$lib/model/dynasty';

const dynastyMap: Map<number, Dynasty> = new Map();

export function create(name: string, by: number) {
	const newDynasty: Dynasty = {
		id: Date.now(),
		name: name,
		foundedBy: by
	};
	dynastyMap.set(newDynasty.id, newDynasty);
}
