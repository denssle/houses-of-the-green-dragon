import { randomUUID } from 'node:crypto';
import type { Dynasty } from '$lib/model/dynasty';
import { Dynasty as DynastyModel } from '$lib/db/model/dynasty';
import { convertToDynasty } from '$lib/db/attributes/dynasty.attributes';
import * as worldService from '$lib/server/service/worldService';

export async function create(name: string, userId: string): Promise<Dynasty> {
	const angelegt = await DynastyModel.create({
		id: randomUUID(),
		name,
		UserId: userId,
		foundedAtTick: await worldService.currentTick()
	});
	return convertToDynasty(angelegt.dataValues);
}

/**
 * Das aktive Haus des Benutzers.
 *
 * Ein Benutzer hat mehrere Dynastien über die Zeit — erlischt eine kinderlos, beginnt er
 * mit einer neuen —, aber höchstens eine lebende. Alle Zugriffe gehen über diese.
 */
export async function getDynastyForUser(userId: string): Promise<Dynasty | undefined> {
	const gefunden = await DynastyModel.findOne({
		where: { UserId: userId, isExtinct: false }
	});
	return gefunden ? convertToDynasty(gefunden.dataValues) : undefined;
}

export async function getDynasty(dynastyId: string): Promise<Dynasty | undefined> {
	const gefunden = await DynastyModel.findByPk(dynastyId);
	return gefunden ? convertToDynasty(gefunden.dataValues) : undefined;
}
