// DOM rendering and input handling. Game rules live in game.js, rules.js and ai.js.
import { Game } from './game.js';
import { cellKey, cellsFor } from './rules.js';

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOG_LIMIT = 8;
const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

export const coordName = (row, col) => `${COLS[col]}${row + 1}`;

export function createApp({ doc = document, rng = Math.random, computerDelay = 700 } = {}) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    body: doc.body,
    status: $('status'),
    placementPanel: $('placement-panel'),
    battlePanel: $('battle-panel'),
    tray: $('ship-tray'),
    rotate: $('rotate-btn'),
    randomize: $('randomize-btn'),
    clear: $('clear-btn'),
    start: $('start-btn'),
    newGame: $('new-game-btn'),
    gameOver: $('game-over'),
    resultTitle: $('result-title'),
    resultDetail: $('result-detail'),
    playAgain: $('play-again-btn'),
    playerBoard: $('player-board'),
    computerBoard: $('computer-board'),
    playerFleet: $('player-fleet'),
    computerFleet: $('computer-fleet'),
    log: $('log'),
  };

  const game = new Game({ rng });
  const size = game.size;
  const ui = {
    selectedId: null,
    horizontal: true,
    hover: null,
    focus: { player: [0, 0], computer: [0, 0] },
    lastShot: { player: null, computer: null },
    timer: null,
  };

  const playerCells = buildBoard(el.playerBoard, 'player');
  const computerCells = buildBoard(el.computerBoard, 'computer');

  function buildBoard(container, side) {
    container.replaceChildren();
    const corner = doc.createElement('div');
    corner.className = 'label';
    corner.setAttribute('aria-hidden', 'true');
    container.append(corner);
    for (let c = 0; c < size; c++) {
      const label = doc.createElement('div');
      label.className = 'label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = COLS[c];
      container.append(label);
    }
    const cells = [];
    for (let r = 0; r < size; r++) {
      const label = doc.createElement('div');
      label.className = 'label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = String(r + 1);
      container.append(label);
      const row = [];
      for (let c = 0; c < size; c++) {
        const cell = doc.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.tabIndex = -1;
        container.append(cell);
        row.push(cell);
      }
      cells.push(row);
    }
    container.addEventListener('click', (event) => {
      const cell = event.target.closest('.cell');
      if (!cell) return;
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      ui.focus[side] = [r, c];
      if (side === 'player') onPlayerCell(r, c);
      else onEnemyCell(r, c);
    });
    container.addEventListener('keydown', (event) => onBoardKey(event, side));
    if (side === 'player') {
      const setHover = (event) => {
        const cell = event.target.closest?.('.cell');
        if (!cell || game.phase !== 'placement') return;
        ui.hover = [Number(cell.dataset.row), Number(cell.dataset.col)];
        renderPlayerBoard();
      };
      container.addEventListener('pointerover', setHover);
      container.addEventListener('focusin', setHover);
      const clearHover = () => {
        if (!ui.hover) return;
        ui.hover = null;
        renderPlayerBoard();
      };
      container.addEventListener('pointerleave', clearHover);
      container.addEventListener('focusout', (event) => {
        if (!container.contains(event.relatedTarget)) clearHover();
      });
    }
    return cells;
  }

  function onBoardKey(event, side) {
    const move = ARROWS[event.key];
    if (!move) return;
    event.preventDefault();
    const [r, c] = ui.focus[side];
    const nr = Math.min(size - 1, Math.max(0, r + move[0]));
    const nc = Math.min(size - 1, Math.max(0, c + move[1]));
    ui.focus[side] = [nr, nc];
    renderTabStops();
    (side === 'player' ? playerCells : computerCells)[nr][nc].focus();
  }

  // ---------- placement ----------

  function selectedDef() {
    return game.fleet.find((def) => def.id === ui.selectedId) ?? null;
  }

  function selectNextUnplaced() {
    ui.selectedId = game.unplacedShips[0]?.id ?? null;
  }

  function placementStatus() {
    const def = selectedDef();
    if (def) {
      return `Place your ${def.name} (${def.length} squares, ${ui.horizontal ? 'horizontal' : 'vertical'}).`;
    }
    if (game.allShipsPlaced) return 'Fleet ready! Press Start battle, or pick a ship in the tray to move it.';
    return 'Pick a ship to place.';
  }

  function onPlayerCell(r, c) {
    if (game.phase !== 'placement') return;
    const def = selectedDef();
    if (!def) {
      setStatus(placementStatus());
      return;
    }
    const existing = game.playerBoard.shipAt(r, c);
    if (existing) {
      setStatus(
        `${coordName(r, c)} already has your ${existing.name}. Ships can't overlap. To move a ship, pick it in the ship tray.`,
      );
      return;
    }
    if (!game.placePlayerShip(def.id, r, c, ui.horizontal)) {
      setStatus(`Your ${def.name} doesn't fit at ${coordName(r, c)}. It can't overlap another ship or go off the board.`);
      return;
    }
    selectNextUnplaced();
    setStatus(placementStatus());
    render();
  }

  function rotate() {
    if (game.phase !== 'placement') return;
    ui.horizontal = !ui.horizontal;
    setStatus(placementStatus());
    render();
  }

  el.rotate.addEventListener('click', rotate);

  el.randomize.addEventListener('click', () => {
    if (game.phase !== 'placement') return;
    game.randomizePlayerShips();
    ui.selectedId = null;
    setStatus(placementStatus());
    render();
  });

  el.clear.addEventListener('click', () => {
    if (game.phase !== 'placement') return;
    game.clearPlayerShips();
    selectNextUnplaced();
    setStatus(placementStatus());
    render();
  });

  el.tray.addEventListener('click', (event) => {
    const button = event.target.closest('.tray-ship');
    if (!button || game.phase !== 'placement') return;
    const id = button.dataset.ship;
    const placed = game.playerBoard.getShip(id);
    if (placed) {
      game.removePlayerShip(id);
      ui.horizontal = placed.horizontal;
    }
    ui.selectedId = id;
    setStatus(placementStatus());
    render();
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'r' && event.key !== 'R') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (game.phase !== 'placement') return;
    event.preventDefault();
    rotate();
  });

  el.start.addEventListener('click', () => {
    if (game.phase !== 'placement' || !game.allShipsPlaced) return;
    game.start();
    ui.selectedId = null;
    ui.hover = null;
    addLog('Battle started. You fire first.');
    setStatus('Your turn. Click a square in Enemy waters to fire.');
    render();
    const [r, c] = ui.focus.computer;
    computerCells[r][c].focus();
  });

  // ---------- battle ----------

  function describe(shooter, shot) {
    const where = coordName(shot.row, shot.col);
    if (shooter === 'player') {
      if (shot.result === 'miss') return `You fired at ${where}: miss.`;
      if (shot.result === 'hit') return `You fired at ${where}: hit!`;
      return `You fired at ${where} and sank the enemy ${shot.ship.name}!`;
    }
    if (shot.result === 'miss') return `Computer fired at ${where}: miss.`;
    if (shot.result === 'hit') return `Computer fired at ${where}: hit on your ${shot.ship.name}!`;
    return `Computer fired at ${where} and sank your ${shot.ship.name}!`;
  }

  function onEnemyCell(r, c) {
    if (game.phase !== 'battle') return;
    if (game.turn !== 'player') {
      setStatus('Hold on, the computer is taking its turn.');
      return;
    }
    if (!game.canPlayerFire(r, c)) {
      setStatus(`You already fired at ${coordName(r, c)}. Pick another square.`);
      return;
    }
    const shot = game.playerFire(r, c);
    ui.lastShot.player = [r, c];
    const message = describe('player', shot);
    addLog(message);
    if (game.phase === 'over') {
      finish();
      return;
    }
    setStatus(`${message} Computer is aiming…`);
    render();
    ui.timer = setTimeout(computerTurn, computerDelay);
  }

  function computerTurn() {
    ui.timer = null;
    if (game.phase !== 'battle' || game.turn !== 'computer') return;
    const shot = game.computerFire();
    ui.lastShot.computer = [shot.row, shot.col];
    const message = describe('computer', shot);
    addLog(message);
    if (game.phase === 'over') {
      finish();
      return;
    }
    setStatus(`${message} Your turn.`);
    render();
  }

  function finish() {
    const won = game.winner === 'player';
    const { shots, hits } = game.stats[game.winner];
    const accuracy = Math.round((100 * hits) / shots);
    el.resultTitle.textContent = won ? 'You win!' : 'The computer wins';
    el.resultDetail.textContent = won
      ? `You sank the whole enemy fleet in ${shots} shots (${accuracy}% accuracy).`
      : `The computer sank your whole fleet in ${shots} shots (${accuracy}% accuracy). Its remaining ships are shown with dashed outlines.`;
    el.gameOver.classList.toggle('lost', !won);
    addLog(won ? 'You win!' : 'The computer wins.');
    setStatus(won ? 'You win! All enemy ships are sunk.' : 'Game over. The computer sank all your ships.');
    render();
    el.playAgain.focus();
  }

  function newGame() {
    if (ui.timer !== null) clearTimeout(ui.timer);
    ui.timer = null;
    game.reset();
    ui.horizontal = true;
    ui.hover = null;
    ui.focus = { player: [0, 0], computer: [0, 0] };
    ui.lastShot = { player: null, computer: null };
    el.log.replaceChildren();
    selectNextUnplaced();
    setStatus(placementStatus());
    render();
  }

  el.playAgain.addEventListener('click', () => {
    newGame();
    playerCells[0][0].focus();
  });
  el.newGame.addEventListener('click', () => {
    newGame();
    playerCells[0][0].focus();
  });

  // ---------- rendering ----------

  function setStatus(text) {
    el.status.textContent = text;
  }

  function addLog(text) {
    const item = doc.createElement('li');
    item.textContent = text;
    el.log.prepend(item);
    while (el.log.children.length > LOG_LIMIT) el.log.lastElementChild.remove();
  }

  function previewCells() {
    const def = selectedDef();
    if (game.phase !== 'placement' || !def || !ui.hover) return null;
    const [r, c] = ui.hover;
    const ok = game.playerBoard.canPlace(def.length, r, c, ui.horizontal);
    const keys = new Set(
      cellsFor(r, c, def.length, ui.horizontal)
        .filter(([cr, cc]) => game.playerBoard.inBounds(cr, cc))
        .map(([cr, cc]) => cellKey(cr, cc)),
    );
    return { ok, keys };
  }

  function renderPlayerBoard() {
    const board = game.playerBoard;
    const preview = previewCells();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = playerCells[r][c];
        const ship = board.shipAt(r, c);
        const shot = board.shotAt(r, c);
        const sunk = ship?.isSunk && shot === 'hit';
        const inPreview = preview?.keys.has(cellKey(r, c));
        const last = ui.lastShot.computer;
        cell.className = 'cell';
        cell.classList.toggle('ship', Boolean(ship));
        cell.classList.toggle('miss', shot === 'miss');
        cell.classList.toggle('hit', shot === 'hit' && !sunk);
        cell.classList.toggle('sunk', Boolean(sunk));
        cell.classList.toggle('preview-ok', Boolean(inPreview && preview.ok));
        cell.classList.toggle('preview-bad', Boolean(inPreview && !preview.ok));
        cell.classList.toggle('last-shot', Boolean(last && last[0] === r && last[1] === c));
        let state = 'water';
        if (sunk) state = `your ${ship.name}, sunk`;
        else if (shot === 'hit') state = `your ${ship.name}, hit`;
        else if (shot === 'miss') state = 'water, computer missed';
        else if (ship) state = `your ${ship.name}`;
        if (inPreview) state += preview.ok ? `, ${selectedDef().name} fits here` : ", ship doesn't fit here";
        cell.setAttribute('aria-label', `${coordName(r, c)}, ${state}`);
      }
    }
  }

  function renderComputerBoard() {
    const board = game.computerBoard;
    const over = game.phase === 'over';
    const canFire = game.phase === 'battle' && game.turn === 'player';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = computerCells[r][c];
        const ship = board.shipAt(r, c);
        const shot = board.shotAt(r, c);
        const sunk = ship?.isSunk;
        const revealed = over && ship && !sunk && shot !== 'hit';
        const last = ui.lastShot.player;
        cell.className = 'cell';
        cell.classList.toggle('shot', shot !== null);
        cell.classList.toggle('miss', shot === 'miss');
        cell.classList.toggle('hit', shot === 'hit' && !sunk);
        cell.classList.toggle('sunk', Boolean(sunk));
        cell.classList.toggle('revealed', Boolean(revealed));
        cell.classList.toggle('last-shot', Boolean(last && last[0] === r && last[1] === c));
        let state = 'not fired at';
        if (sunk) state = `sunk ${ship.name}`;
        else if (shot === 'hit') state = 'hit';
        else if (shot === 'miss') state = 'miss';
        else if (revealed) state = `enemy ${ship.name}, not found`;
        cell.setAttribute('aria-label', `${coordName(r, c)}, ${state}`);
        cell.setAttribute('aria-disabled', String(!canFire || shot !== null));
      }
    }
  }

  function renderTabStops() {
    const active = game.phase === 'placement' ? 'player' : game.phase === 'battle' ? 'computer' : null;
    for (const [side, cells] of [
      ['player', playerCells],
      ['computer', computerCells],
    ]) {
      const [fr, fc] = ui.focus[side];
      cells.forEach((row, r) =>
        row.forEach((cell, c) => {
          cell.tabIndex = side === active && r === fr && c === fc ? 0 : -1;
        }),
      );
    }
  }

  function pips(length, hitCount = 0) {
    const wrap = doc.createElement('span');
    wrap.className = 'pips';
    wrap.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < length; i++) {
      const pip = doc.createElement('span');
      if (i < hitCount) pip.className = 'hit';
      wrap.append(pip);
    }
    return wrap;
  }

  function renderTray() {
    el.tray.replaceChildren(
      ...game.fleet.map((def) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'tray-ship';
        button.dataset.ship = def.id;
        const placed = Boolean(game.playerBoard.getShip(def.id));
        button.classList.toggle('placed', placed);
        button.setAttribute('aria-pressed', String(def.id === ui.selectedId));
        const label = doc.createElement('span');
        label.textContent = `${def.name} (${def.length})${placed ? ' ✓' : ''}`;
        button.append(label, pips(def.length));
        button.setAttribute(
          'aria-label',
          `${def.name}, ${def.length} squares, ${placed ? 'placed, select to move it' : 'not placed'}`,
        );
        return button;
      }),
    );
  }

  function renderFleets() {
    el.playerFleet.replaceChildren(
      ...game.fleet.map((def) => {
        const ship = game.playerBoard.getShip(def.id);
        const item = doc.createElement('li');
        const hits = ship?.hits.size ?? 0;
        item.classList.toggle('sunk', Boolean(ship?.isSunk));
        const status = !ship ? 'not placed' : ship.isSunk ? 'sunk' : hits ? `${hits} of ${def.length} hit` : 'afloat';
        item.append(`${def.name}`, pips(def.length, hits));
        item.setAttribute('aria-label', `${def.name}, ${status}`);
        return item;
      }),
    );
    el.computerFleet.replaceChildren(
      ...game.fleet.map((def) => {
        const ship = game.computerBoard.getShip(def.id);
        const sunk = Boolean(ship?.isSunk);
        const item = doc.createElement('li');
        item.classList.toggle('sunk', sunk);
        item.append(`${def.name}`, pips(def.length, sunk ? def.length : 0));
        item.setAttribute('aria-label', `Enemy ${def.name}, ${sunk ? 'sunk' : 'afloat'}`);
        return item;
      }),
    );
  }

  function render() {
    const phase = game.phase;
    el.body.classList.toggle('phase-placement', phase === 'placement');
    el.body.classList.toggle('phase-battle', phase === 'battle');
    el.body.classList.toggle('phase-over', phase === 'over');
    el.body.classList.toggle('player-turn', phase === 'battle' && game.turn === 'player');
    el.placementPanel.hidden = phase !== 'placement';
    el.battlePanel.hidden = phase !== 'battle';
    el.gameOver.hidden = phase !== 'over';
    el.rotate.textContent = ui.horizontal ? 'Rotate (R): Horizontal ↔' : 'Rotate (R): Vertical ↕';
    el.start.disabled = !game.allShipsPlaced;
    renderTray();
    renderPlayerBoard();
    renderComputerBoard();
    renderTabStops();
    renderFleets();
  }

  selectNextUnplaced();
  setStatus(placementStatus());
  render();

  return { game, ui, el, playerCells, computerCells, newGame };
}
