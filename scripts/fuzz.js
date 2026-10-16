// Random-input fuzz test of the full game screen (jsdom).
// Each session fires random commands in random order and in every phase: board clicks on both boards,
// double clicks, hover, Rotate, R / Ctrl+R, Randomize, Clear, tray picks, Start, New game, Play again,
// arrow keys and timer ticks. After every action the rules and the screen are checked against the game state.
// Exits non-zero if any check fails.
// Usage: node scripts/fuzz.js [games=1000] [seed=4242]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createApp } from '../js/ui.js';
import { FLEET, BOARD_SIZE, cellKey } from '../js/rules.js';

const HTML = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8').replace(
  /<script[\s\S]*?<\/script>/g,
  '',
);
const MAX_ACTIONS = 20000;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Manual clock so the computer's delayed shot fires only when the fuzzer says so.
const timers = new Map();
let nextTimer = 1;
globalThis.setTimeout = (fn) => {
  const id = nextTimer++;
  timers.set(id, fn);
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
function tick() {
  for (const [id, fn] of [...timers]) {
    timers.delete(id);
    fn();
  }
}

const snapshot = (board) =>
  new Map(board.ships.map((s) => [s.id, JSON.stringify({ cells: s.cells, h: s.horizontal })]));

function checkBoard(board, mustBeFull) {
  const seen = new Set();
  const ids = new Set();
  for (const ship of board.ships) {
    const def = FLEET.find((d) => d.id === ship.id);
    if (!def) throw Error(`unknown ship ${ship.id}`);
    if (ids.has(ship.id)) throw Error(`duplicate ship ${ship.id}`);
    ids.add(ship.id);
    if (ship.cells.length !== def.length) throw Error(`${ship.id} has wrong length`);
    ship.cells.forEach(([r, c], i) => {
      if (!board.inBounds(r, c)) throw Error(`${ship.id} off the board`);
      const [r0, c0] = ship.cells[0];
      if (ship.horizontal ? r !== r0 || c !== c0 + i : c !== c0 || r !== r0 + i)
        throw Error(`${ship.id} is not a straight line`);
      const k = cellKey(r, c);
      if (seen.has(k)) throw Error(`ships overlap at ${k}`);
      seen.add(k);
      if (board.shipAt(r, c) !== ship) throw Error(`shipAt index wrong at ${k}`);
    });
  }
  if (mustBeFull && board.ships.length !== FLEET.length) throw Error('fleet incomplete in battle');
}

function checkScreen(app, doc) {
  const { game } = app;
  const phase = game.phase;
  const vis = (id) => !doc.getElementById(id).hidden;
  if (vis('placement-panel') !== (phase === 'placement')) throw Error('placement panel visibility wrong');
  if (vis('battle-panel') !== (phase === 'battle')) throw Error('battle panel visibility wrong');
  if (vis('game-over') !== (phase === 'over')) throw Error('game-over panel visibility wrong');
  if (doc.getElementById('start-btn').disabled !== !game.allShipsPlaced) throw Error('Start button state wrong');
  if (!doc.getElementById('status').textContent.trim()) throw Error('empty status message');
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = app.playerCells[r][c];
      const pShip = game.playerBoard.shipAt(r, c);
      const pShot = game.playerBoard.shotAt(r, c);
      if (p.classList.contains('ship') !== Boolean(pShip)) throw Error(`player ${r},${c} ship mark wrong`);
      if (p.classList.contains('miss') !== (pShot === 'miss')) throw Error(`player ${r},${c} miss mark wrong`);
      const pSunk = Boolean(pShip?.isSunk);
      if (p.classList.contains('sunk') !== pSunk) throw Error(`player ${r},${c} sunk mark wrong`);
      if (p.classList.contains('hit') !== (pShot === 'hit' && !pSunk)) throw Error(`player ${r},${c} hit mark wrong`);
      const e = app.computerCells[r][c];
      const eShip = game.computerBoard.shipAt(r, c);
      const eShot = game.computerBoard.shotAt(r, c);
      const eSunk = Boolean(eShip?.isSunk);
      if (e.classList.contains('ship')) throw Error('enemy ship shown directly');
      if (e.classList.contains('miss') !== (eShot === 'miss')) throw Error(`enemy ${r},${c} miss mark wrong`);
      if (e.classList.contains('sunk') !== eSunk) throw Error(`enemy ${r},${c} sunk mark wrong`);
      if (e.classList.contains('hit') !== (eShot === 'hit' && !eSunk)) throw Error(`enemy ${r},${c} hit mark wrong`);
      const revealed = e.classList.contains('revealed');
      if (revealed !== (phase === 'over' && Boolean(eShip) && !eSunk && eShot === null))
        throw Error(`enemy ${r},${c} reveal wrong`);
      const label = e.getAttribute('aria-label');
      if (
        phase !== 'over' &&
        eShip &&
        eShot === null &&
        /enemy|carrier|battleship|cruiser|submarine|destroyer/i.test(label)
      )
        throw Error(`enemy ship leaked in label at ${r},${c}`);
    }
  const stops = (cells) => cells.flat().filter((x) => x.tabIndex === 0).length;
  const [ps, cs] = [stops(app.playerCells), stops(app.computerCells)];
  const want = phase === 'placement' ? [1, 0] : phase === 'battle' ? [0, 1] : [0, 0];
  if (ps !== want[0] || cs !== want[1]) throw Error(`tab stops wrong (${ps}/${cs}) in ${phase}`);
  const sunkItems = [...doc.querySelectorAll('#computer-fleet li.sunk')].length;
  if (sunkItems !== game.computerBoard.ships.filter((s) => s.isSunk).length) throw Error('enemy fleet list wrong');
}

function checkRules(app, before, action) {
  const { game } = app;
  const after = snapshot(game.playerBoard);
  checkBoard(game.playerBoard, game.phase !== 'placement');
  if (game.phase !== 'placement') checkBoard(game.computerBoard, true);
  const { player: p, computer: c } = game.stats;
  if (game.playerBoard.shots.size !== c.shots || game.computerBoard.shots.size !== p.shots)
    throw Error('a square was fired at twice or a shot was not counted');
  if (before.phase === 'placement' && game.phase === 'placement') {
    const lost = [...before.ships.keys()].filter((id) => !after.has(id));
    const moved = [...before.ships.keys()].filter((id) => after.has(id) && after.get(id) !== before.ships.get(id));
    const added = [...after.keys()].filter((id) => !before.ships.has(id));
    if (action.type === 'playerCell') {
      if (lost.length || moved.length)
        throw Error(`board click removed or moved a placed ship (${[...lost, ...moved]})`);
      if (added.length > 1 || (added.length && added[0] !== before.selected)) throw Error('wrong ship placed');
    } else if (action.type === 'tray') {
      if (moved.length || added.length || lost.some((id) => id !== action.id))
        throw Error('tray pick changed other ships');
    } else if (action.type === 'randomize') {
      if (after.size !== FLEET.length) throw Error('Randomize did not place the whole fleet');
    } else if (action.type === 'clear' || action.type === 'newGame' || action.type === 'playAgain') {
      // may empty the board
    } else if (lost.length || moved.length || added.length) {
      throw Error(`${action.type} changed the fleet during placement`);
    }
  }
  if (before.phase === 'placement' && game.phase === 'battle' && before.ships.size !== FLEET.length)
    throw Error('battle started without a full fleet');
  if (game.phase === 'battle') {
    if (p.shots - c.shots !== (game.turn === 'computer' ? 1 : 0)) throw Error('turns did not alternate');
    if ((game.turn === 'computer') !== (app.ui.timer !== null))
      throw Error('computer turn without a pending shot (or vice versa)');
    if (game.playerBoard.allSunk() || game.computerBoard.allSunk()) throw Error('a fleet is sunk but the game goes on');
  }
  if (before.phase === 'battle' && before.turn === 'computer' && p.shots > before.pShots)
    throw Error('player fired during the computer turn');
  if (before.phase === 'battle' && game.phase !== 'placement' && p.shots > before.pShots + 1)
    throw Error('player got two shots in one action');
  if (game.phase === 'over') {
    const loser = game.winner === 'player' ? game.computerBoard : game.playerBoard;
    const winner = game.winner === 'player' ? game.playerBoard : game.computerBoard;
    if (!loser.allSunk() || winner.allSunk()) throw Error('wrong winner');
    if (before.phase === 'over' && (p.shots !== before.pShots || c.shots !== before.cShots))
      throw Error('a shot landed after game over');
    if (app.ui.timer !== null) throw Error('computer shot still pending after game over');
  }
}

export function runFuzz({ games = 1000, seed = 4242 } = {}) {
  const rng = mulberry32(seed);
  const pick = (n) => Math.floor(rng() * n);
  const report = { games: 0, playerWins: 0, computerWins: 0, actions: 0, resetsMidGame: 0, failures: [], counts: {} };
  let session = 0;
  while (report.games < games && session < games * 3) {
    session++;
    timers.clear();
    const dom = new JSDOM(HTML, { pretendToBeVisual: true });
    const { window: win } = dom;
    const doc = win.document;
    const app = createApp({ doc, rng: mulberry32(seed * 1000 + session), computerDelay: 700 });
    const { game } = app;
    const $ = (id) => doc.getElementById(id);
    // Like a real user, only click things that are on screen (not inside a hidden panel).
    const click = (node) => {
      if (node.closest('[hidden]')) return;
      node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    };
    const key = (node, k, o = {}) =>
      node.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
    const rc = () => [pick(BOARD_SIZE), pick(BOARD_SIZE)];
    const errors = [];
    win.addEventListener('error', (e) => errors.push(e.message));
    let overSeen = 0;
    let steps = 0;
    try {
      while (steps < MAX_ACTIONS) {
        steps++;
        // Weighted so placement, battle and game over are all reached, but every command can fire in any phase.
        const inBattle = game.phase === 'battle';
        const bag = [
          ['playerCell', 12],
          ['enemyCell', inBattle ? 30 : 4],
          ['doubleEnemy', 3],
          ['hover', 6],
          ['leave', 2],
          ['rotate', 4],
          ['rKey', 3],
          ['ctrlR', 1],
          ['randomize', game.phase === 'placement' ? 1 : 0.5],
          ['clear', 1.5],
          ['tray', 5],
          ['start', game.allShipsPlaced ? 4 : 1],
          ['newGame', 0.05],
          ['playAgain', game.phase === 'over' ? 3 : 0.5],
          ['arrow', 3],
          ['tick', inBattle ? 20 : 2],
        ];
        let roll = rng() * bag.reduce((s, [, w]) => s + w, 0);
        const type = bag.find(([, w]) => (roll -= w) < 0)[0];
        const action = { type };
        const before = {
          phase: game.phase,
          turn: game.turn,
          selected: app.ui.selectedId,
          ships: snapshot(game.playerBoard),
          pShots: game.stats.player.shots,
          cShots: game.stats.computer.shots,
        };
        const wasMidGame = game.phase === 'battle';
        switch (type) {
          case 'playerCell': {
            // Often aim at a square that already holds a ship, to test overlap handling.
            let [r, c] = rc();
            const taken = game.playerBoard.ships.flatMap((ship) => ship.cells);
            if (taken.length && rng() < 0.4) [r, c] = taken[pick(taken.length)];
            click(app.playerCells[r][c]);
            break;
          }
          case 'enemyCell': {
            // Mix blind clicks (often repeats) with aimed ones, so the player also wins some games.
            let [r, c] = rc();
            if (rng() < 0.6) {
              const open = [];
              for (let i = 0; i < 10; i++)
                for (let j = 0; j < 10; j++)
                  if (game.computerBoard.shotAt(i, j) === null) open.push([i, j, game.computerBoard.shipAt(i, j)]);
              const ships = open.filter((x) => x[2]);
              const pool = ships.length && rng() < 0.45 ? ships : open;
              if (pool.length) [r, c] = pool[pick(pool.length)];
            }
            click(app.computerCells[r][c]);
            break;
          }
          case 'doubleEnemy': {
            const [r, c] = rc();
            click(app.computerCells[r][c]);
            click(app.computerCells[r][c]);
            break;
          }
          case 'hover':
            app.playerCells[pick(10)][pick(10)].dispatchEvent(new win.Event('pointerover', { bubbles: true }));
            break;
          case 'leave':
            $('player-board').dispatchEvent(new win.Event('pointerleave'));
            break;
          case 'rotate':
            click($('rotate-btn'));
            break;
          case 'rKey':
            key(doc.body, rng() < 0.5 ? 'r' : 'R');
            break;
          case 'ctrlR':
            key(doc.body, 'r', { ctrlKey: true });
            break;
          case 'randomize':
            click($('randomize-btn'));
            break;
          case 'clear':
            click($('clear-btn'));
            break;
          case 'tray': {
            const b = $('ship-tray').querySelectorAll('.tray-ship');
            if (b.length) {
              const n = b[pick(b.length)];
              action.id = n.dataset.ship;
              click(n);
            }
            break;
          }
          case 'start':
            click($('start-btn'));
            break;
          case 'newGame':
            click($('new-game-btn'));
            if (wasMidGame) report.resetsMidGame++;
            break;
          case 'playAgain':
            click($('play-again-btn'));
            break;
          case 'arrow':
            key(app.playerCells[0][0], ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'][pick(4)]);
            key(app.computerCells[0][0], ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'][pick(4)]);
            break;
          case 'tick':
            tick();
            break;
        }
        report.counts[type] = (report.counts[type] || 0) + 1;
        report.actions++;
        if (errors.length) throw Error(`uncaught error: ${errors[0]}`);
        checkRules(app, before, action);
        checkScreen(app, doc);
        if (game.phase === 'over' && before.phase !== 'over') {
          report.games++;
          game.winner === 'player' ? report.playerWins++ : report.computerWins++;
          if (++overSeen >= 1 && rng() < 0.7) {
            // a few random post-game commands, then move on
            for (let i = 0; i < 5; i++) {
              const b = {
                phase: game.phase,
                turn: game.turn,
                selected: app.ui.selectedId,
                ships: snapshot(game.playerBoard),
                pShots: game.stats.player.shots,
                cShots: game.stats.computer.shots,
              };
              const which = pick(4);
              if (which === 0) click(app.computerCells[pick(10)][pick(10)]);
              if (which === 1) click(app.playerCells[pick(10)][pick(10)]);
              if (which === 2) tick();
              if (which === 3) click($('rotate-btn'));
              checkRules(app, b, { type: 'post' });
              checkScreen(app, doc);
            }
            break;
          }
          if (report.games >= games) break;
        }
      }
      if (steps >= MAX_ACTIONS)
        throw Error(
          `session did not finish a game within the action limit (turn ${game.turn}, shots ${game.stats.player.shots}/${game.stats.computer.shots}, timer ${app.ui.timer})`,
        );
    } catch (e) {
      report.failures.push({ session, step: steps, phase: game.phase, error: e.message });
    }
    win.close();
  }
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const games = Number(process.argv[2] ?? 1000);
  const seed = Number(process.argv[3] ?? 4242);
  const t0 = Date.now();
  const r = runFuzz({ games, seed });
  console.log(
    JSON.stringify(
      { ...r, failures: r.failures.slice(0, 20), failureCount: r.failures.length, seconds: (Date.now() - t0) / 1000 },
      null,
      1,
    ),
  );
  if (r.failures.length) process.exitCode = 1;
}
