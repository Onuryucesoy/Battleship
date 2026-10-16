import { describe, expect, it } from 'vitest';
import { Board, FLEET, cellKey } from '../js/rules.js';
import { HuntTargetAI, ProbabilityAI } from '../js/ai.js';
import { seeded } from './helpers.js';

function playOut(AI, seed) {
  const rng = seeded(seed);
  const board = new Board();
  board.placeFleetRandomly(FLEET, rng);
  const ai = new AI({ rng });
  const fired = new Set();
  while (!board.allSunk()) {
    const [r, c] = ai.nextShot();
    const key = cellKey(r, c);
    if (fired.has(key)) throw new Error(`repeated ${key}`);
    if (!board.inBounds(r, c)) throw new Error(`off board ${key}`);
    fired.add(key);
    ai.recordResult(r, c, board.receiveShot(r, c));
  }
  return fired.size;
}

const isNeighbour = ([r, c], [hr, hc]) => Math.abs(r - hr) + Math.abs(c - hc) === 1;

describe('ProbabilityAI', () => {
  it('never fires at the same square twice and always finishes the game', () => {
    for (let seed = 1; seed <= 200; seed++) expect(playOut(ProbabilityAI, seed)).toBeLessThanOrEqual(100);
  });

  it('can fire at every square of an empty board without repeating', () => {
    const ai = new ProbabilityAI({ rng: seeded(1) });
    const fired = new Set();
    for (let i = 0; i < 100; i++) {
      const [r, c] = ai.nextShot();
      fired.add(cellKey(r, c));
      ai.recordResult(r, c, { result: 'miss', ship: null });
    }
    expect(fired.size).toBe(100);
    expect(() => ai.nextShot()).toThrow();
  });

  it('fires next to a hit', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ai = new ProbabilityAI({ rng: seeded(seed) });
      ai.recordResult(4, 4, { result: 'hit', ship: null });
      expect(isNeighbour(ai.nextShot(), [4, 4])).toBe(true);
    }
  });

  it('follows the line once two hits line up', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ai = new ProbabilityAI({ rng: seeded(seed) });
      ai.recordResult(4, 4, { result: 'hit', ship: null });
      ai.recordResult(4, 5, { result: 'hit', ship: null });
      expect([cellKey(4, 3), cellKey(4, 6)]).toContain(cellKey(...ai.nextShot()));
    }
  });

  it('turns around at the end of a line', () => {
    const ai = new ProbabilityAI({ rng: seeded(1) });
    ai.recordResult(4, 4, { result: 'hit', ship: null });
    ai.recordResult(4, 5, { result: 'hit', ship: null });
    ai.recordResult(4, 6, { result: 'miss', ship: null });
    expect(ai.nextShot()).toEqual([4, 3]);
  });

  it('searches the cell next to a hit in a corner', () => {
    const ai = new ProbabilityAI({ rng: seeded(2) });
    ai.recordResult(0, 0, { result: 'hit', ship: null });
    expect([cellKey(0, 1), cellKey(1, 0)]).toContain(cellKey(...ai.nextShot()));
  });

  it('goes back to hunting away from a sunk ship', () => {
    const ai = new ProbabilityAI({ rng: seeded(4) });
    const ship = { id: 'destroyer', cells: [[4, 4], [4, 5]] };
    ai.recordResult(4, 4, { result: 'hit', ship: null });
    ai.recordResult(4, 5, { result: 'sunk', ship });
    expect(ai.remaining.map((s) => s.id)).not.toContain('destroyer');
    const [r, c] = ai.nextShot();
    expect(isNeighbour([r, c], [4, 4]) || isNeighbour([r, c], [4, 5])).toBe(false);
  });

  it('skips squares where no remaining ship can fit', () => {
    const ai = new ProbabilityAI({ rng: seeded(5) });
    // Wall off (0,0) with misses: only a 1-square ship could be there and none exists.
    ai.recordResult(0, 1, { result: 'miss', ship: null });
    ai.recordResult(1, 0, { result: 'miss', ship: null });
    expect(ai.heatMap()[0][0]).toBe(0);
  });

  it('prefers the centre of an empty board over the corners', () => {
    const heat = new ProbabilityAI().heatMap();
    expect(heat[4][4]).toBeGreaterThan(heat[0][0]);
  });

  it('needs clearly fewer shots than a hunt-and-target AI', () => {
    let probability = 0;
    let huntTarget = 0;
    for (let seed = 1; seed <= 150; seed++) {
      probability += playOut(ProbabilityAI, seed);
      huntTarget += playOut(HuntTargetAI, seed);
    }
    expect(probability / 150).toBeLessThan(50);
    expect(probability).toBeLessThan(huntTarget * 0.85);
  });

  it('rejects recording the same square twice', () => {
    const ai = new ProbabilityAI();
    ai.recordResult(1, 1, { result: 'miss', ship: null });
    expect(() => ai.recordResult(1, 1, { result: 'miss', ship: null })).toThrow();
  });
});
