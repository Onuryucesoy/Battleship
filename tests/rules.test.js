import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, Board, FLEET, cellKey } from '../js/rules.js';
import { seeded } from './helpers.js';

const [carrier, battleship, cruiser, submarine, destroyer] = FLEET;

describe('fleet', () => {
  it('is a 10x10 board with ships of length 5, 4, 3, 3 and 2', () => {
    expect(BOARD_SIZE).toBe(10);
    expect(FLEET.map((s) => s.length)).toEqual([5, 4, 3, 3, 2]);
  });
});

describe('Board placement', () => {
  it('places ships horizontally and vertically', () => {
    const board = new Board();
    expect(board.placeShip(carrier, 0, 0, true).cells).toEqual([
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
    ]);
    expect(board.placeShip(destroyer, 5, 5, false).cells).toEqual([[5, 5], [6, 5]]);
  });

  it('rejects ships that go off the board', () => {
    const board = new Board();
    expect(board.placeShip(carrier, 0, 6, true)).toBeNull();
    expect(board.placeShip(carrier, 6, 0, false)).toBeNull();
    expect(board.placeShip(destroyer, -1, 0, true)).toBeNull();
    expect(board.placeShip(destroyer, 0, 1.5, true)).toBeNull();
    expect(board.placeShip(carrier, 0, 5, true)).not.toBeNull();
    expect(board.placeShip(battleship, 6, 0, false)).not.toBeNull();
  });

  it('rejects overlapping ships and leaves the board unchanged', () => {
    const board = new Board();
    board.placeShip(carrier, 2, 2, true);
    expect(board.placeShip(battleship, 0, 4, false)).toBeNull();
    expect(board.ships).toHaveLength(1);
    expect(board.shipAt(1, 4)).toBeNull();
  });

  it('allows ships to touch side by side', () => {
    const board = new Board();
    board.placeShip(carrier, 0, 0, true);
    expect(board.placeShip(battleship, 1, 0, true)).not.toBeNull();
  });

  it('refuses to place the same ship twice', () => {
    const board = new Board();
    board.placeShip(cruiser, 0, 0, true);
    expect(board.placeShip(cruiser, 5, 5, true)).toBeNull();
  });

  it('removes a ship and frees its squares', () => {
    const board = new Board();
    board.placeShip(submarine, 3, 3, false);
    expect(board.removeShip('submarine').id).toBe('submarine');
    expect(board.shipAt(3, 3)).toBeNull();
    expect(board.placeShip(carrier, 3, 0, true)).not.toBeNull();
    expect(board.removeShip('nope')).toBeNull();
  });

  it('places a valid random fleet every time', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const board = new Board();
      board.placeFleetRandomly(FLEET, seeded(seed));
      const cells = new Set();
      for (const ship of board.ships) {
        expect(ship.cells).toHaveLength(ship.length);
        const rows = new Set(ship.cells.map(([r]) => r));
        const cols = new Set(ship.cells.map(([, c]) => c));
        expect(rows.size === 1 || cols.size === 1).toBe(true);
        for (const [r, c] of ship.cells) {
          expect(board.inBounds(r, c)).toBe(true);
          cells.add(cellKey(r, c));
        }
      }
      expect(board.ships.map((s) => s.id)).toEqual(FLEET.map((s) => s.id));
      expect(cells.size).toBe(17);
    }
  });

  it('produces different layouts for different games', () => {
    const rng = seeded(3);
    const layouts = new Set();
    for (let i = 0; i < 20; i++) {
      const board = new Board();
      board.placeFleetRandomly(FLEET, rng);
      layouts.add(JSON.stringify(board.ships.map((s) => s.cells)));
    }
    expect(layouts.size).toBe(20);
  });
});

describe('Board shots', () => {
  it('reports miss, hit and sunk', () => {
    const board = new Board();
    board.placeShip(destroyer, 0, 0, true);
    expect(board.receiveShot(5, 5).result).toBe('miss');
    expect(board.receiveShot(0, 0).result).toBe('hit');
    const last = board.receiveShot(0, 1);
    expect(last.result).toBe('sunk');
    expect(last.ship.id).toBe('destroyer');
    expect(board.allSunk()).toBe(true);
  });

  it('refuses repeated and off-board shots', () => {
    const board = new Board();
    board.receiveShot(1, 1);
    expect(() => board.receiveShot(1, 1)).toThrow();
    expect(() => board.receiveShot(10, 0)).toThrow(RangeError);
  });

  it('is not all sunk while any ship is afloat, or when empty', () => {
    const board = new Board();
    expect(board.allSunk()).toBe(false);
    board.placeShip(destroyer, 0, 0, true);
    board.placeShip(cruiser, 2, 0, true);
    board.receiveShot(0, 0);
    board.receiveShot(0, 1);
    expect(board.allSunk()).toBe(false);
  });
});
