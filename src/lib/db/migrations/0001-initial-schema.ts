import { DataTypes, type QueryInterface } from 'sequelize';

/**
 * Das Schema zum Stand von Phase 1.3.
 *
 * Muss Spalte für Spalte dasselbe ergeben wie die Modelle — inklusive Vorgabewerten und
 * Zeitstempeln. Dass es das tut, prüft `migrations.spec.ts`: Ohne diesen Abgleich
 * driften Modelle und Migration auseinander, und der Unterschied fällt erst in
 * Produktion auf, wo nur die Migration läuft.
 */

const id = { type: DataTypes.STRING, primaryKey: true, allowNull: false };
const zeitstempel = {
	createdAt: { type: DataTypes.DATE, allowNull: false },
	updatedAt: { type: DataTypes.DATE, allowNull: false }
};

export async function up(queryInterface: QueryInterface): Promise<void> {
	await queryInterface.createTable('users', {
		id,
		nickname: { type: DataTypes.STRING, allowNull: false, unique: true },
		email: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		password: { type: DataTypes.STRING, allowNull: false },
		...zeitstempel
	});

	await queryInterface.createTable('sessionTokens', {
		UserId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		token: { type: DataTypes.STRING, allowNull: false },
		...zeitstempel
	});

	await queryInterface.createTable('dynasties', {
		id,
		name: { type: DataTypes.STRING, allowNull: false },
		UserId: { type: DataTypes.STRING, allowNull: false },
		isExtinct: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
		foundedAtTick: { type: DataTypes.INTEGER, allowNull: false },
		extinctAtTick: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
		...zeitstempel
	});

	await queryInterface.createTable('characters', {
		id,
		firstName: { type: DataTypes.STRING, allowNull: false },
		title: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Neuling' },
		role: { type: DataTypes.STRING, allowNull: false },
		gender: { type: DataTypes.STRING, allowNull: false },
		actionPoints: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		lastTickProcessed: { type: DataTypes.INTEGER, allowNull: false },
		money: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		birthTick: { type: DataTypes.INTEGER, allowNull: false },
		deathTick: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
		RegionId: { type: DataTypes.STRING, allowNull: false },
		DynastyId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		motherId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		fatherId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		spouseId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		HomeBuildingId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		...zeitstempel
	});

	await queryInterface.createTable('relationships', {
		fromCharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		toCharacterId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		affection: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		lastChangedTick: { type: DataTypes.INTEGER, allowNull: false },
		...zeitstempel
	});

	await queryInterface.createTable('dynastyRelationships', {
		fromDynastyId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		toDynastyId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		standing: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		lastChangedTick: { type: DataTypes.INTEGER, allowNull: false },
		...zeitstempel
	});

	await queryInterface.createTable('regions', {
		id,
		name: { type: DataTypes.STRING, allowNull: false },
		type: { type: DataTypes.STRING, allowNull: false },
		treasury: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
		...zeitstempel
	});

	await queryInterface.createTable('regionLinks', {
		fromRegionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		toRegionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
		distanceInTicks: { type: DataTypes.INTEGER, allowNull: false },
		...zeitstempel
	});

	await queryInterface.createTable('plots', {
		id,
		address: { type: DataTypes.STRING, allowNull: false },
		type: { type: DataTypes.STRING, allowNull: false },
		resourceType: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		RegionId: { type: DataTypes.STRING, allowNull: false },
		ownerType: { type: DataTypes.STRING, allowNull: false, defaultValue: 'NONE' },
		OwnerCharacterId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		forSalePrice: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
		...zeitstempel
	});

	await queryInterface.createTable('buildings', {
		id,
		name: { type: DataTypes.STRING, allowNull: false },
		optionId: { type: DataTypes.INTEGER, allowNull: false },
		level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
		condition: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
		lastConditionTick: { type: DataTypes.INTEGER, allowNull: false },
		PlotId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		ownerType: { type: DataTypes.STRING, allowNull: false, defaultValue: 'CHARACTER' },
		OwnerCharacterId: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
		forSalePrice: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
		...zeitstempel
	});

	// Ohne Zeitstempel: Die Weltzeit ist eine Zeile, die nur fortgeschrieben wird.
	await queryInterface.createTable('worlds', {
		id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false, defaultValue: 1 },
		currentTick: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
		lastTickAt: { type: DataTypes.DATE, allowNull: false }
	});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
	// Umgekehrte Reihenfolge, damit spätere Fremdschlüssel nicht ins Leere zeigen.
	for (const tabelle of [
		'worlds',
		'buildings',
		'plots',
		'regionLinks',
		'regions',
		'dynastyRelationships',
		'relationships',
		'characters',
		'dynasties',
		'sessionTokens',
		'users'
	]) {
		await queryInterface.dropTable(tabelle);
	}
}
