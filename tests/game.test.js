import { describe, expect, it } from 'vitest';
import { Game } from '../js/game.js';
import { seeded } from './helpers.js';

function readyGame(seed = 1) {
  const game = new Game({ rng: seeded(seed) });
  game.randomizePlayerShips();
  game.start();
  return game;
}

function untried(board) {
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (!board.shotAt(r, c)) return [r, c];
  return null;
}

describe('Game', () => {
  it('starts in placement and needs every ship before the battle', () => {
    const game = new Game({ rng: seeded(1) });
    expect(game.phase).toBe('placement');
    expect(() => game.start()).toThrow();
    game.placePlayerShip('carrier', 0, 0, true);
    expect(game.unplacedShips.map((s) => s.id)).toEqual(['battleship', 'cruiser', 'submarine', 'destroyer']);
    expect(() => game.start()).toThrow();
  });

  it('only allows ship changes during placement', () => {
    const game = readyGame();
    expect(game.placePlayerShip('carrier', 0, 0, true)).toBeNull();
    expect(game.removePlayerShip('carrier')).toBeNull();
    const before = JSON.stringify(game.playerBoard.ships.map((s) => s.cells));
    game.randomizePlayerShips();
    game.clearPlayerShips();
    expect(JSON.stringify(game.playerBoard.ships.map((s) => s.cells))).toBe(before);
    expect(() => game.start()).toThrow();
  });

  it('places the computer fleet randomly when the battle starts', () => {
    const layouts = new Set();
    const rng = seeded(9);
    for (let i = 0; i < 10; i++) {
      const game = new Game({ rng });
      game.randomizePlayerShips();
      expect(game.computerBoard.ships).toHaveLength(0);
      game.start();
      expect(game.computerBoard.ships).toHaveLength(5);
      layouts.add(JSON.stringify(game.computerBoard.ships.map((s) => s.cells)));
    }
    expect(layouts.size).toBe(10);
  });

  it('alternates turns and a hit does not give an extra turn', () => {
    const game = readyGame(2);
    const [r, c] = game.computerBoard.ships[0].cells[0];
    expect(game.playerFire(r, c).result).toBe('hit');
    expect(game.turn).toBe('computer');
    expect(() => game.playerFire(...untried(game.computerBoard))).toThrow();
    game.computerFire();
    expect(game.turn).toBe('player');
    expect(() => game.computerFire()).toThrow();
  });

  it('gives the computer exactly one shot after a hit on the player', () => {
    // Keep firing until the computer scores a hit, then check the turn passes back.
    const game = readyGame(3);
    let shot;
    do {
      game.playerFire(...untried(game.computerBoard));
      shot = game.computerFire();
    } while (shot.result === 'miss' && game.phase === 'battle');
    expect(shot.result).not.toBe('miss');
    expect(game.turn).toBe('player');
  });

  it('does not let the player fire at the same square twice', () => {
    const game = readyGame(4);
    game.playerFire(0, 0);
    game.computerFire();
    expect(game.canPlayerFire(0, 0)).toBe(false);
    expect(() => game.playerFire(0, 0)).toThrow();
    expect(game.turn).toBe('player');
  });

  it('ends the game when every ship of one side is sunk', () => {
    const game = readyGame(5);
    const targets = game.computerBoard.ships.flatMap((s) => s.cells);
    for (const [i, [r, c]] of targets.entries()) {
      game.playerFire(r, c);
      if (i < targets.length - 1) game.computerFire();
    }
    expect(game.phase).toBe('over');
    expect(game.winner).toBe('player');
    expect(game.stats.player).toEqual({ shots: 17, hits: 17 });
    expect(() => game.computerFire()).toThrow();
    expect(() => game.playerFire(...untried(game.computerBoard))).toThrow();
  });

  it('lets the computer win and always ends within 100 shots each', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = readyGame(seed);
      let turns = 0;
      while (game.phase === 'battle') {
        if (game.turn === 'player') game.playerFire(...untried(game.computerBoard));
        else game.computerFire();
        expect(++turns).toBeLessThanOrEqual(200);
      }
      expect(['player', 'computer']).toContain(game.winner);
      const loser = game.winner === 'player' ? game.computerBoard : game.playerBoard;
      expect(loser.allSunk()).toBe(true);
    }
  });

  it('resets to a fresh placement phase', () => {
    const game = readyGame(6);
    game.playerFire(0, 0);
    game.reset();
    expect(game.phase).toBe('placement');
    expect(game.playerBoard.ships).toHaveLength(0);
    expect(game.computerBoard.shots.size).toBe(0);
    expect(game.ai.shots.size).toBe(0);
  });
});
