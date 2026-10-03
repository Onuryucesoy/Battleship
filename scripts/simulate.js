// Simulates many full AI-vs-AI games using the real game logic and checks that
// each one ends with exactly one winner, no repeated shots and no errors.
// Usage: node scripts/simulate.js [games=1000] [seed=12345]
import { Board, FLEET, HuntTargetAI, BOARD_SIZE, cellKey } from '../js/game.js';

const games = Number(process.argv[2] ?? 1000);
const seed = Number(process.argv[3] ?? 12345);
const TOTAL_SHIP_CELLS = FLEET.reduce((sum, ship) => sum + ship.length, 0);
const MAX_SHOTS = BOARD_SIZE * BOARD_SIZE;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkFleet(board) {
  const cells = new Set();
  for (const ship of board.ships) {
    for (const [r, c] of ship.cells) {
      if (!board.inBounds(r, c)) throw new Error('Ship placed off the board');
      const key = cellKey(r, c);
      if (cells.has(key)) throw new Error('Ships overlap');
      cells.add(key);
    }
  }
  if (board.ships.length !== FLEET.length || cells.size !== TOTAL_SHIP_CELLS) {
    throw new Error('Fleet placed incorrectly');
  }
}

function playGame(rng) {
  const players = [0, 1].map(() => {
    const board = new Board();
    board.placeFleetRandomly(FLEET, rng);
    checkFleet(board);
    return { board, ai: new HuntTargetAI(BOARD_SIZE, rng), fired: new Set() };
  });

  let current = rng() < 0.5 ? 0 : 1;
  for (let turn = 0; turn < 2 * MAX_SHOTS; turn++) {
    const shooter = players[current];
    const target = players[1 - current].board;
    const [row, col] = shooter.ai.nextShot();
    const key = cellKey(row, col);
    if (shooter.fired.has(key)) throw new Error(`AI fired at ${key} twice`);
    shooter.fired.add(key);
    const outcome = target.receiveShot(row, col);
    shooter.ai.recordResult(row, col, outcome);

    if (target.allSunk()) {
      const loser = players[1 - current].board;
      if (players[current].board.allSunk()) throw new Error('Both fleets sunk');
      if (!loser.allSunk()) throw new Error('Winner declared with ships afloat');
      return { winner: current, shots: shooter.fired.size };
    }
    current = 1 - current;
  }
  throw new Error('Game did not finish');
}

const rng = mulberry32(seed);
const wins = [0, 0];
let totalShots = 0;
let minShots = Infinity;
let maxShots = 0;
const failures = [];

for (let i = 0; i < games; i++) {
  try {
    const { winner, shots } = playGame(rng);
    wins[winner]++;
    totalShots += shots;
    minShots = Math.min(minShots, shots);
    maxShots = Math.max(maxShots, shots);
  } catch (err) {
    failures.push({ game: i + 1, message: err.message });
  }
}

const completed = wins[0] + wins[1];
console.log(`Simulated ${games} AI-vs-AI games (seed ${seed})`);
console.log(`  Completed with a winner: ${completed}`);
console.log(`  Wins: AI A ${wins[0]}, AI B ${wins[1]}`);
if (completed) {
  console.log(
    `  Shots by winner: avg ${(totalShots / completed).toFixed(1)}, min ${minShots}, max ${maxShots}`,
  );
}
console.log(`  Errors: ${failures.length}`);

if (failures.length || completed !== games) {
  for (const f of failures.slice(0, 10)) console.error(`  Game ${f.game}: ${f.message}`);
  process.exit(1);
}
console.log('All games ended with a winner and no errors.');
