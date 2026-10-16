// Plays full games through the real Game engine: Player A (the human seat, moves first) and
// Player B (the computer) both use ProbabilityAI. Checks the rules on every shot and reports win ratios.
// Exits non-zero if any game fails a check.
// Usage: node scripts/ab-test.js [games=1000] [seed=2026]
import { Game } from '../js/game.js';
import { ProbabilityAI } from '../js/ai.js';
import { FLEET, cellKey } from '../js/rules.js';
const N = Number(process.argv[2] ?? 1000),
  SEED = Number(process.argv[3] ?? 2026);
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TOTAL = FLEET.reduce((s, f) => s + f.length, 0);
function checkFleet(b) {
  const s = new Set();
  for (const sh of b.ships)
    for (const [r, c] of sh.cells) {
      if (!b.inBounds(r, c)) throw Error('ship off board');
      const k = cellKey(r, c);
      if (s.has(k)) throw Error('ships overlap');
      s.add(k);
    }
  if (b.ships.length !== FLEET.length || s.size !== TOTAL) throw Error('bad fleet');
  const lens = b.ships
    .map((x) => x.cells.length)
    .sort()
    .join();
  if (
    lens !==
    FLEET.map((f) => f.length)
      .sort()
      .join()
  )
    throw Error('wrong ship lengths');
}
function checkShot(board, seen, r, c, out, who) {
  if (!board.inBounds(r, c)) throw Error(`${who} fired off board`);
  const k = cellKey(r, c);
  if (seen.has(k)) throw Error(`${who} repeated ${k}`);
  seen.add(k);
  const ship = board.shipAt(r, c);
  if (!ship && out.result !== 'miss') throw Error(`${who}: water reported as ${out.result}`);
  if (ship && out.result === 'miss') throw Error(`${who}: ship reported as miss`);
  if (ship) {
    const sunk = ship.cells.every(
      ([a, b]) => board.shotAt(a, b) !== null && board.shotAt(a, b) !== 'miss',
    );
    if ((out.result === 'sunk') !== sunk)
      throw Error(`${who}: sunk flag wrong (${out.result}, really sunk=${sunk})`);
  }
}
const res = { A: 0, B: 0, failed: 0, errors: {}, shotsA: [], shotsB: [], len: [] };
for (let g = 0; g < N; g++) {
  const rng = mulberry32(SEED + g * 7919);
  const game = new Game({ rng });
  const aiA = new ProbabilityAI({ rng });
  try {
    game.randomizePlayerShips();
    game.start();
    checkFleet(game.playerBoard);
    checkFleet(game.computerBoard);
    const seenA = new Set(),
      seenB = new Set();
    let last = null,
      turns = 0;
    while (game.phase === 'battle') {
      if (++turns > 200) throw Error('game did not end within 200 turns');
      const who = game.turn;
      if (who === last) throw Error(`${who} got two turns in a row`);
      last = who;
      if (who === 'player') {
        const [r, c] = aiA.nextShot();
        if (!game.canPlayerFire(r, c)) throw Error('A picked illegal square');
        const out = game.playerFire(r, c);
        aiA.recordResult(r, c, out);
        checkShot(game.computerBoard, seenA, r, c, out, 'A');
      } else {
        const out = game.computerFire();
        checkShot(game.playerBoard, seenB, out.row, out.col, out, 'B');
      }
      const over = game.computerBoard.allSunk() || game.playerBoard.allSunk();
      if (over !== (game.phase === 'over')) throw Error('game-over state wrong');
    }
    const loser = game.winner === 'player' ? game.computerBoard : game.playerBoard,
      winnerB = game.winner === 'player' ? game.playerBoard : game.computerBoard;
    if (!loser.allSunk() || winnerB.allSunk()) throw Error('wrong winner');
    const { player: p, computer: c } = game.stats;
    if (p.shots !== seenA.size || c.shots !== seenB.size) throw Error('stats mismatch');
    if (!(p.shots === c.shots || p.shots === c.shots + 1))
      throw Error('turn counts not alternating');
    if ((game.winner === 'player' ? p.hits : c.hits) !== TOTAL)
      throw Error('winner hit count != 17');
    try {
      game.playerFire(0, 0);
      throw Error('fired after game over');
    } catch (e) {
      if (e.message === 'fired after game over') throw e;
    }
    game.winner === 'player' ? res.A++ : res.B++;
    res.shotsA.push(p.shots);
    res.shotsB.push(c.shots);
    res.len.push(p.shots + c.shots);
  } catch (e) {
    res.failed++;
    res.errors[e.message] = (res.errors[e.message] || 0) + 1;
  }
}
const avg = (a) => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1);
console.log(
  JSON.stringify(
    {
      games: N,
      seed: SEED,
      A_wins: res.A,
      B_wins: res.B,
      A_pct: ((100 * res.A) / N).toFixed(1),
      B_pct: ((100 * res.B) / N).toFixed(1),
      failed: res.failed,
      errors: res.errors,
      avgShotsA: avg(res.shotsA),
      avgShotsB: avg(res.shotsB),
      avgTotalShots: avg(res.len),
      minLen: Math.min(...res.len),
      maxLen: Math.max(...res.len),
    },
    null,
    1,
  ),
);
if (res.failed) process.exitCode = 1;
