import { describe, it, expect } from 'vitest';
import { Board, FLEET, Game, HuntTargetAI, cellKey } from '../js/game.js';

function seededRng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placeFleetInRows(game) {
  for (let i = 0; i < FLEET.length; i++) game.placePlayerShip(i * 2, 0, true);
}

describe('ship placement', () => {
  it('accepts ships that fit on the board', () => {
    const board = new Board();
    expect(board.placeShip('Carrier', 5, 0, 5, true)).not.toBeNull();
    expect(board.placeShip('Battleship', 4, 6, 9, false)).not.toBeNull();
    expect(board.shipAt(0, 9).name).toBe('Carrier');
    expect(board.shipAt(9, 9).name).toBe('Battleship');
  });

  it('rejects ships that go off the right or bottom edge', () => {
    const board = new Board();
    expect(board.canPlace(0, 6, 5, true)).toBe(false);
    expect(board.canPlace(6, 0, 5, false)).toBe(false);
    expect(board.placeShip('Carrier', 5, 0, 6, true)).toBeNull();
    expect(board.ships).toHaveLength(0);
  });

  it('rejects negative or non-integer coordinates', () => {
    const board = new Board();
    expect(board.canPlace(-1, 0, 2, true)).toBe(false);
    expect(board.canPlace(0, -1, 2, false)).toBe(false);
    expect(board.canPlace(0.5, 0, 2, true)).toBe(false);
  });

  it('rejects overlapping ships and leaves the board unchanged', () => {
    const board = new Board();
    board.placeShip('Carrier', 5, 2, 2, true);
    expect(board.canPlace(0, 4, 3, false)).toBe(false);
    expect(board.placeShip('Cruiser', 3, 0, 4, false)).toBeNull();
    expect(board.ships).toHaveLength(1);
    expect(board.shipAt(0, 4)).toBeNull();
  });

  it('allows ships to touch without overlapping', () => {
    const board = new Board();
    board.placeShip('Carrier', 5, 0, 0, true);
    expect(board.placeShip('Battleship', 4, 1, 0, true)).not.toBeNull();
  });

  it('places a valid random fleet', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const board = new Board();
      board.placeFleetRandomly(FLEET, seededRng(seed));
      const cells = board.ships.flatMap((s) => s.cells.map(([r, c]) => cellKey(r, c)));
      expect(board.ships.map((s) => s.length)).toEqual([5, 4, 3, 3, 2]);
      expect(new Set(cells).size).toBe(17);
      for (const ship of board.ships) {
        for (const [r, c] of ship.cells) expect(board.inBounds(r, c)).toBe(true);
      }
    }
  });

  it('places the player fleet in order and stops after the last ship', () => {
    const game = new Game();
    expect(game.nextShipToPlace.name).toBe('Carrier');
    placeFleetInRows(game);
    expect(game.allPlayerShipsPlaced).toBe(true);
    expect(game.nextShipToPlace).toBeNull();
    expect(game.placePlayerShip(9, 9, true)).toBeNull();
  });
});

describe('firing', () => {
  it('reports hits and misses', () => {
    const board = new Board();
    board.placeShip('Destroyer', 2, 0, 0, true);
    expect(board.receiveShot(0, 0).result).toBe('hit');
    expect(board.receiveShot(5, 5).result).toBe('miss');
    expect(board.hasBeenShot(0, 0)).toBe(true);
    expect(board.hasBeenShot(5, 5)).toBe(true);
  });

  it('refuses to accept the same shot twice or a shot off the board', () => {
    const board = new Board();
    board.receiveShot(3, 3);
    expect(() => board.receiveShot(3, 3)).toThrow();
    expect(() => board.receiveShot(10, 0)).toThrow(RangeError);
  });

  it('sinks a ship once every cell is hit', () => {
    const board = new Board();
    board.placeShip('Cruiser', 3, 4, 4, false);
    expect(board.receiveShot(4, 4).result).toBe('hit');
    expect(board.receiveShot(5, 4).result).toBe('hit');
    const last = board.receiveShot(6, 4);
    expect(last.result).toBe('sunk');
    expect(last.ship.name).toBe('Cruiser');
    expect(last.ship.isSunk()).toBe(true);
  });
});

describe('win detection', () => {
  it('only reports all sunk when every ship is sunk', () => {
    const board = new Board();
    expect(board.allSunk()).toBe(false);
    board.placeShip('Destroyer', 2, 0, 0, true);
    board.placeShip('Submarine', 3, 2, 0, true);
    board.receiveShot(0, 0);
    board.receiveShot(0, 1);
    expect(board.allSunk()).toBe(false);
    board.receiveShot(2, 0);
    board.receiveShot(2, 1);
    board.receiveShot(2, 2);
    expect(board.allSunk()).toBe(true);
  });

  it('declares the player the winner after sinking the whole enemy fleet', () => {
    const game = new Game({ rng: seededRng(7) });
    placeFleetInRows(game);
    game.start();
    const targets = game.computerBoard.ships.flatMap((s) => s.cells);
    for (const [r, c] of targets) {
      if (game.phase === 'over') break;
      game.playerFire(r, c);
      if (game.phase === 'battle') game.computerFire();
    }
    expect(game.phase).toBe('over');
    expect(game.winner).toBe('player');
  });

  it('alternates turns, even after a hit', () => {
    const game = new Game({ rng: seededRng(3) });
    placeFleetInRows(game);
    game.start();
    const [r, c] = game.computerBoard.ships[0].cells[0];
    expect(game.playerFire(r, c).result).toBe('hit');
    expect(game.turn).toBe('computer');
    expect(() => game.playerFire(0, 0)).toThrow();
    game.computerFire();
    expect(game.turn).toBe('player');
  });

  it('resets fully for a new game', () => {
    const game = new Game();
    placeFleetInRows(game);
    game.start();
    game.reset();
    expect(game.phase).toBe('placement');
    expect(game.winner).toBeNull();
    expect(game.playerBoard.ships).toHaveLength(0);
    expect(game.computerBoard.ships).toHaveLength(0);
    expect(game.ai.shots.size).toBe(0);
  });
});

describe('computer AI', () => {
  it('never fires at the same cell twice and covers the whole board', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const board = new Board();
      board.placeFleetRandomly(FLEET, seededRng(seed));
      const ai = new HuntTargetAI(10, seededRng(seed + 100));
      const seen = new Set();
      for (let i = 0; i < 100; i++) {
        const [r, c] = ai.nextShot();
        const key = cellKey(r, c);
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        ai.recordResult(r, c, board.receiveShot(r, c));
      }
      expect(seen.size).toBe(100);
      expect(() => ai.nextShot()).toThrow();
    }
  });

  it('targets adjacent cells after a hit', () => {
    const board = new Board();
    board.placeShip('Cruiser', 3, 5, 5, true);
    const ai = new HuntTargetAI(10, seededRng(1));
    ai.recordResult(5, 5, board.receiveShot(5, 5));
    const [r, c] = ai.nextShot();
    expect(Math.abs(r - 5) + Math.abs(c - 5)).toBe(1);
  });

  it('follows the line once the direction is known', () => {
    const board = new Board();
    board.placeShip('Carrier', 5, 3, 2, true);
    const ai = new HuntTargetAI(10, seededRng(2));
    ai.recordResult(3, 4, board.receiveShot(3, 4));
    ai.recordResult(3, 5, board.receiveShot(3, 5));
    for (let i = 0; i < 3; i++) {
      const [r, c] = ai.nextShot();
      expect(r).toBe(3);
      ai.recordResult(r, c, board.receiveShot(r, c));
    }
  });

  it('finishes off a ship after a hit, then returns to hunting', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const board = new Board();
      board.placeShip('Battleship', 4, 2, 6, false);
      const ai = new HuntTargetAI(10, seededRng(seed));
      ai.recordResult(3, 6, board.receiveShot(3, 6));
      let shots = 0;
      while (!board.ships[0].isSunk()) {
        const [r, c] = ai.nextShot();
        ai.recordResult(r, c, board.receiveShot(r, c));
        shots++;
      }
      // 3 more hits needed; at most 3 misses around the first hit plus 1 overshoot.
      expect(shots).toBeLessThanOrEqual(7);
      expect(ai.mode).toBe('hunt');
    }
  });

  it('keeps targeting a second ship that was hit while sinking the first', () => {
    const board = new Board();
    board.placeShip('Destroyer', 2, 0, 0, true);
    board.placeShip('Submarine', 3, 1, 0, true);
    const ai = new HuntTargetAI(10, seededRng(4));
    ai.recordResult(0, 0, board.receiveShot(0, 0));
    ai.recordResult(1, 0, board.receiveShot(1, 0));
    let shots = 0;
    while (!board.allSunk()) {
      const [r, c] = ai.nextShot();
      ai.recordResult(r, c, board.receiveShot(r, c));
      expect(++shots).toBeLessThan(15);
    }
  });
});
