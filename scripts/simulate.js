// Plays many games with the real rules to check the AI and measure its strength.
// 1. Each AI sinks randomly placed fleets; reports shots needed (fewer is better).
// 2. Head to head: ProbabilityAI vs HuntTargetAI with alternating turns.
// Exits non-zero if any AI repeats a square, fires off the board or a game fails to end.
// Usage: node scripts/simulate.js [games=1000] [seed=12345]
import { Board, FLEET, BOARD_SIZE, cellKey } from '../js/rules.js';
import { ProbabilityAI, HuntTargetAI, RandomAI } from '../js/ai.js';

const games = Number(process.argv[2] ?? 1000);
const seed = Number(process.argv[3] ?? 12345);
const MAX_SHOTS = BOARD_SIZE * BOARD_SIZE;

export function mulberry32(a) {
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
      if (cells.has(cellKey(r, c))) throw new Error('Ships overlap');
      cells.add(cellKey(r, c));
    }
  }
  const expected = FLEET.reduce((sum, s) => sum + s.length, 0);
  if (board.ships.length !== FLEET.length || cells.size !== expected) throw new Error('Bad fleet');
}

function fire(ai, board) {
  const [r, c] = ai.nextShot();
  if (!board.inBounds(r, c)) throw new Error(`${ai.constructor.name} fired off the board`);
  if (board.shotAt(r, c)) throw new Error(`${ai.constructor.name} repeated ${r},${c}`);
  ai.recordResult(r, c, board.receiveShot(r, c));
}

function shotsToWin(AI, rng) {
  const board = new Board();
  board.placeFleetRandomly(FLEET, rng);
  checkFleet(board);
  const ai = new AI({ rng });
  let shots = 0;
  while (!board.allSunk()) {
    if (++shots > MAX_SHOTS) throw new Error('Game did not end');
    fire(ai, board);
  }
  return shots;
}

function headToHead(rng, probabilityFirst) {
  const players = [ProbabilityAI, HuntTargetAI].map((AI) => {
    const board = new Board();
    board.placeFleetRandomly(FLEET, rng);
    return { name: AI.name, ai: new AI({ rng }), board };
  });
  let turn = probabilityFirst ? 0 : 1;
  for (let i = 0; i < 2 * MAX_SHOTS; i++) {
    const shooter = players[turn];
    const target = players[1 - turn];
    fire(shooter.ai, target.board);
    if (target.board.allSunk()) return shooter.name;
    turn = 1 - turn;
  }
  throw new Error('Head-to-head game did not end');
}

const rng = mulberry32(seed);
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

console.log(`${games} games per AI, seed ${seed}\n`);
console.log('Shots needed to sink a random fleet (fewer is better):');
for (const AI of [ProbabilityAI, HuntTargetAI, RandomAI]) {
  const results = Array.from({ length: games }, () => shotsToWin(AI, rng)).sort((a, b) => a - b);
  const mean = results.reduce((a, b) => a + b, 0) / results.length;
  console.log(
    `  ${AI.name.padEnd(14)} mean ${mean.toFixed(1).padStart(5)}  median ${percentile(results, 0.5)}  ` +
      `best ${results[0]}  worst ${results.at(-1)}`,
  );
}

let wins = 0;
for (let g = 0; g < games; g++) if (headToHead(rng, g % 2 === 0) === 'ProbabilityAI') wins++;
console.log(
  `\nHead to head, alternating who shoots first: ProbabilityAI won ${wins}/${games} ` +
    `(${((100 * wins) / games).toFixed(1)}%) against HuntTargetAI`,
);
console.log('\nAll games ended correctly with no repeated or off-board shots.');
