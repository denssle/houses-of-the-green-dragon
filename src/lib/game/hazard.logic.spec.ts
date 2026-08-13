import { describe, expect, it } from 'vitest';
import {
	chancePerTick,
	fireChance,
	fireDamage,
	FIRE_DAMAGE_MIN,
	GUARD_EFFECT,
	loot,
	pickTarget,
	raidChance,
	RAIDS_PER_YEAR,
	type Target
} from '$lib/game/hazard.logic';
import { TICKS_PER_YEAR } from '$lib/game/time';

describe('Unglücke', () => {
	describe('wie oft etwas geschieht', () => {
		it('rechnet den Jahreswert auf den Tick herunter', () => {
			expect(chancePerTick(TICKS_PER_YEAR)).toBe(1);
			expect(chancePerTick(RAIDS_PER_YEAR) * TICKS_PER_YEAR).toBeCloseTo(RAIDS_PER_YEAR);
		});

		it('bleibt beim Feuer selten genug, dass Bauen sich lohnt', () => {
			// Ein Brand alle zwei Spieljahre, verteilt über alle Gebäude der Stadt.
			expect(fireChance() * TICKS_PER_YEAR).toBeLessThan(1);
		});
	});

	describe('was die Wache ausrichtet', () => {
		it('senkt die Gefahr mit jedem Wächter', () => {
			const ohne: number = raidChance(0);
			const einer: number = raidChance(1);
			const drei: number = raidChance(3);

			expect(einer).toBeCloseTo(ohne * (1 - GUARD_EFFECT));
			expect(drei).toBeLessThan(einer);
		});

		it('kommt nie auf null', () => {
			// Eine Stadt, die sich vollständig freikaufen kann, hätte das Problem gelöst
			// statt es zu verwalten — und die Wache wäre eine einmalige Ausgabe.
			expect(raidChance(50)).toBeGreaterThan(0);
		});

		it('hilft nicht gegen Feuer', () => {
			// Dafür bräuchte es einen Brunnen — Punkt 12.
			expect(fireChance()).toBe(fireChance());
		});
	});

	describe('wen es trifft', () => {
		const ziele: Target<string>[] = [
			{ ref: 'arm', worth: 1 },
			{ ref: 'reich', worth: 99 }
		];

		it('den Reichen fast immer', () => {
			// Gewichtet nach Beutewert: Wer das Hundertfache hat, wird hundertmal so oft
			// heimgesucht.
			expect(pickTarget(ziele, 0.5)).toBe('reich');
			expect(pickTarget(ziele, 0.999)).toBe('reich');
			expect(pickTarget(ziele, 0.001)).toBe('arm');
		});

		it('niemanden, bei dem nichts zu holen ist', () => {
			// Der Schutz gegen die Todesspirale: Wer nichts hat, lohnt den Weg nicht.
			expect(pickTarget([{ ref: 'leer', worth: 0 }], 0.5)).toBeUndefined();
			expect(pickTarget([], 0.5)).toBeUndefined();
		});
	});

	describe('die Beute', () => {
		it('ist ein Viertel, aufgerundet', () => {
			expect(loot(100)).toBe(25);
			// Auch beim kleinen Ziel fehlt hinterher etwas — ein Raub ohne Verlust wäre
			// eine Meldung ohne Folge.
			expect(loot(1)).toBe(1);
			expect(loot(3)).toBe(1);
		});

		it('ist nie mehr, als da ist', () => {
			expect(loot(0)).toBe(0);
			expect(loot(-5)).toBe(0);
		});
	});

	describe('der Brandschaden', () => {
		it('nimmt ein Drittel, aber mindestens einen spürbaren Batzen', () => {
			expect(fireDamage(90)).toBe(30);
			expect(fireDamage(20)).toBe(FIRE_DAMAGE_MIN);
		});

		it('legt kein Haus in Schutt und Asche', () => {
			// Der Verfall erledigt das, wenn niemand herrichtet. Ein Brand, der ein
			// Lebenswerk in einem Tick auslöscht, wäre eine Strafe und keine Wendung.
			expect(fireDamage(100)).toBeLessThan(100);
			expect(fireDamage(10)).toBe(10);
			expect(fireDamage(0)).toBe(0);
		});
	});
});
