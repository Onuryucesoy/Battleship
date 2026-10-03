import { Game, BOARD_SIZE, Board } from './game.js';

const COMPUTER_DELAY_MS = 600;
const COLUMN_LABELS = Array.from({ length: BOARD_SIZE }, (_, i) => String(i + 1));
const ROW_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, BOARD_SIZE).split('');

const els = {
  status: document.getElementById('status'),
  placementControls: document.getElementById('placement-controls'),
  rotateBtn: document.getElementById('rotate-btn'),
  randomizeBtn: document.getElementById('randomize-btn'),
  clearBtn: document.getElementById('clear-btn'),
  startBtn: document.getElementById('start-btn'),
  gameOver: document.getElementById('game-over'),
  winnerText: document.getElementById('winner-text'),
  playAgainBtn: document.getElementById('play-again-btn'),
  playerBoard: document.getElementById('player-board'),
  computerBoard: document.getElementById('computer-board'),
  playerFleet: document.getElementById('player-fleet'),
  computerFleet: document.getElementById('computer-fleet'),
};

let game;
let horizontal = true;
let hoverCell = null;
let lastComputerShot = null;
let roundId = 0;
let pendingComputerTurn = null;

const coordName = (row, col) => `${ROW_LABELS[row]}${COLUMN_LABELS[col]}`;

function buildGrid(container) {
  container.replaceChildren();
  const cells = [];
  container.append(document.createElement('div'));
  for (const label of COLUMN_LABELS) {
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = label;
    container.append(el);
  }
  for (let r = 0; r < BOARD_SIZE; r++) {
    const rowLabel = document.createElement('div');
    rowLabel.className = 'label';
    rowLabel.textContent = ROW_LABELS[r];
    container.append(rowLabel);
    cells.push([]);
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.setAttribute('role', 'gridcell');
      container.append(cell);
      cells[r].push(cell);
    }
  }
  return cells;
}

const playerCells = buildGrid(els.playerBoard);
const computerCells = buildGrid(els.computerBoard);

function cellFromEvent(event) {
  const cell = event.target.closest('.cell');
  if (!cell) return null;
  return [Number(cell.dataset.row), Number(cell.dataset.col)];
}

function previewCells() {
  const next = game.nextShipToPlace;
  if (game.phase !== 'placement' || !next || !hoverCell) return null;
  const [row, col] = hoverCell;
  return {
    cells: Board.cellsFor(row, col, next.length, horizontal),
    valid: game.playerBoard.canPlace(row, col, next.length, horizontal),
  };
}

function cellState(board, row, col) {
  const ship = board.shipAt(row, col);
  if (!board.hasBeenShot(row, col)) return { ship, shot: null };
  if (!ship) return { ship, shot: 'miss' };
  return { ship, shot: ship.isSunk() ? 'sunk' : 'hit' };
}

function renderBoard(cells, board, { revealShips, label }) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const el = cells[r][c];
      const { ship, shot } = cellState(board, r, c);
      el.className = 'cell';
      if (ship && revealShips) el.classList.add('ship');
      if (shot) el.classList.add(shot);
      let desc = shot ?? (ship && revealShips ? 'ship' : 'water');
      if (shot === 'sunk') desc = `sunk ${ship.name}`;
      el.setAttribute('aria-label', `${label} ${coordName(r, c)}: ${desc}`);
    }
  }
}

function renderFleet(list, board, { showPending }) {
  list.replaceChildren();
  game.fleet.forEach(({ name, length }, i) => {
    const li = document.createElement('li');
    const ship = board.ships[i];
    li.textContent = `${name} (${length})`;
    if (ship?.isSunk()) li.classList.add('sunk');
    if (showPending && !ship) {
      li.classList.add(i === board.ships.length ? 'next' : 'pending');
    }
    list.append(li);
  });
}

function render() {
  const placing = game.phase === 'placement';
  const over = game.phase === 'over';

  renderBoard(playerCells, game.playerBoard, { revealShips: true, label: 'Your board' });
  renderBoard(computerCells, game.computerBoard, { revealShips: false, label: 'Enemy board' });

  if (over) {
    for (const ship of game.computerBoard.ships) {
      for (const [r, c] of ship.cells) {
        if (!game.computerBoard.hasBeenShot(r, c)) computerCells[r][c].classList.add('revealed');
      }
    }
  }

  const preview = previewCells();
  if (preview) {
    for (const [r, c] of preview.cells) {
      if (r < BOARD_SIZE && c < BOARD_SIZE) {
        playerCells[r][c].classList.add(preview.valid ? 'preview' : 'preview-invalid');
      }
    }
  }

  if (lastComputerShot && !placing) {
    playerCells[lastComputerShot[0]][lastComputerShot[1]].classList.add('last-shot');
  }

  const playerTab = placing ? 0 : -1;
  const enemyTab = game.phase === 'battle' ? 0 : -1;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      playerCells[r][c].tabIndex = playerTab;
      computerCells[r][c].tabIndex = enemyTab;
    }
  }

  els.playerBoard.classList.toggle('placing', placing);
  els.computerBoard.classList.toggle(
    'clickable',
    game.phase === 'battle' && game.turn === 'player',
  );

  renderFleet(els.playerFleet, game.playerBoard, { showPending: placing });
  renderFleet(els.computerFleet, game.computerBoard, { showPending: false });

  els.placementControls.hidden = !placing;
  els.rotateBtn.textContent = `Rotate: ${horizontal ? 'Horizontal' : 'Vertical'}`;
  els.startBtn.disabled = !game.allPlayerShipsPlaced;

  els.gameOver.hidden = !over;
  if (over) {
    els.winnerText.textContent =
      game.winner === 'player' ? 'You win! The enemy fleet is sunk.' : 'The computer wins! Your fleet is sunk.';
  }
}

function setStatus(text) {
  els.status.textContent = text;
}

function placementStatus() {
  const next = game.nextShipToPlace;
  if (next) {
    setStatus(
      `Place your ${next.name} (${next.length}). Click a cell on your board. Press R or Rotate to turn it.`,
    );
  } else {
    setStatus('All ships placed. Press Start Game when ready.');
  }
}

function describeShot(outcome, isPlayer, row, col) {
  const where = coordName(row, col);
  if (outcome.result === 'miss') return isPlayer ? `You fired at ${where} and missed.` : `Computer fired at ${where} and missed.`;
  if (outcome.result === 'hit') return isPlayer ? `You hit a ship at ${where}!` : `Computer hit your ship at ${where}!`;
  return isPlayer
    ? `You sank the enemy ${outcome.ship.name}!`
    : `Computer sank your ${outcome.ship.name} at ${where}!`;
}

function newGame() {
  roundId++;
  clearTimeout(pendingComputerTurn);
  pendingComputerTurn = null;
  game = new Game();
  horizontal = true;
  hoverCell = null;
  lastComputerShot = null;
  placementStatus();
  render();
}

function computerTurn(expectedRound) {
  pendingComputerTurn = null;
  if (expectedRound !== roundId || game.phase !== 'battle' || game.turn !== 'computer') return;
  const shot = game.computerFire();
  lastComputerShot = [shot.row, shot.col];
  const message = describeShot(shot, false, shot.row, shot.col);
  setStatus(game.phase === 'over' ? message : `${message} Your turn.`);
  render();
  if (game.phase === 'over') els.playAgainBtn.focus();
}

els.playerBoard.addEventListener('click', (event) => {
  const pos = cellFromEvent(event);
  if (!pos || game.phase !== 'placement' || !game.nextShipToPlace) return;
  const next = game.nextShipToPlace;
  if (game.placePlayerShip(pos[0], pos[1], horizontal)) {
    placementStatus();
  } else {
    setStatus(`Your ${next.name} doesn't fit there. Ships can't overlap or leave the board.`);
  }
  render();
});

els.playerBoard.addEventListener('mouseover', (event) => {
  const pos = cellFromEvent(event);
  if (!pos || game.phase !== 'placement') return;
  hoverCell = pos;
  render();
});

els.playerBoard.addEventListener('mouseleave', () => {
  hoverCell = null;
  render();
});

els.playerBoard.addEventListener('focusin', (event) => {
  const pos = cellFromEvent(event);
  if (!pos || game.phase !== 'placement') return;
  hoverCell = pos;
  render();
});

els.playerBoard.addEventListener('focusout', (event) => {
  if (els.playerBoard.contains(event.relatedTarget)) return;
  hoverCell = null;
  render();
});

els.computerBoard.addEventListener('click', (event) => {
  const pos = cellFromEvent(event);
  if (!pos || game.phase !== 'battle' || game.turn !== 'player') return;
  const [row, col] = pos;
  if (game.computerBoard.hasBeenShot(row, col)) {
    setStatus(`You already fired at ${coordName(row, col)}. Pick another cell.`);
    return;
  }
  const outcome = game.playerFire(row, col);
  const message = describeShot(outcome, true, row, col);
  if (game.phase === 'battle') {
    setStatus(`${message} Computer is aiming...`);
    pendingComputerTurn = setTimeout(computerTurn, COMPUTER_DELAY_MS, roundId);
  } else {
    setStatus(message);
  }
  render();
  if (game.phase === 'over') els.playAgainBtn.focus();
});

function rotate() {
  horizontal = !horizontal;
  render();
}

els.rotateBtn.addEventListener('click', rotate);

document.addEventListener('keydown', (event) => {
  if ((event.key === 'r' || event.key === 'R') && game.phase === 'placement') rotate();
});

els.randomizeBtn.addEventListener('click', () => {
  game.randomizePlayerShips();
  placementStatus();
  render();
});

els.clearBtn.addEventListener('click', () => {
  game.clearPlayerShips();
  placementStatus();
  render();
});

els.startBtn.addEventListener('click', () => {
  if (!game.allPlayerShipsPlaced) return;
  game.start();
  hoverCell = null;
  setStatus('Battle stations! Fire at a cell on the enemy board.');
  render();
  computerCells[0][0].focus();
});

els.playAgainBtn.addEventListener('click', () => {
  newGame();
  els.rotateBtn.focus();
});

newGame();
