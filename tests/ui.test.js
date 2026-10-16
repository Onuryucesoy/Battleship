import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../js/ui.js';
import { seeded } from './helpers.js';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const DELAY = 700;

let doc;
let win;
let app;

function setup(seed = 1) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  win = dom.window;
  doc = win.document;
  app = createApp({ doc, rng: seeded(seed), computerDelay: DELAY });
  return app;
}

const cell = (side, r, c) => (side === 'player' ? app.playerCells : app.computerCells)[r][c];
const click = (element) => element.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const hover = (element) => element.dispatchEvent(new win.Event('pointerover', { bubbles: true }));
const key = (target, k, opts = {}) =>
  target.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
const $ = (id) => doc.getElementById(id);
const status = () => $('status').textContent;
const shotsOn = (board) => board.shots.size;

function startBattle() {
  click($('randomize-btn'));
  click($('start-btn'));
}

function firstUntried(board) {
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (!board.shotAt(r, c)) return [r, c];
  return null;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('placement', () => {
  it('places ships in order by clicking, then enables Start', () => {
    setup();
    expect($('start-btn').disabled).toBe(true);
    for (let r = 0; r < 5; r++) click(cell('player', r * 2, 0));
    expect(app.game.playerBoard.ships.map((s) => s.length)).toEqual([5, 4, 3, 3, 2]);
    expect(app.game.playerBoard.ships.every((s) => s.horizontal)).toBe(true);
    expect($('start-btn').disabled).toBe(false);
    expect(status()).toMatch(/Fleet ready/);
  });

  it('shows a green preview where a ship fits and red where it does not', () => {
    setup();
    hover(cell('player', 0, 0));
    expect(doc.querySelectorAll('#player-board .preview-ok')).toHaveLength(5);
    hover(cell('player', 0, 8));
    expect(doc.querySelectorAll('#player-board .preview-bad')).toHaveLength(2);
    expect(doc.querySelectorAll('#player-board .preview-ok')).toHaveLength(0);
  });

  it('rejects a ship that would go off the board or overlap', () => {
    setup();
    click(cell('player', 0, 7));
    expect(app.game.playerBoard.ships).toHaveLength(0);
    expect(status()).toMatch(/doesn't fit at H1/);
    click(cell('player', 3, 0));
    click($('rotate-btn'));
    click(cell('player', 0, 2)); // vertical battleship would cross the carrier at C4
    expect(app.game.playerBoard.ships).toHaveLength(1);
    click(cell('player', 7, 9)); // vertical battleship off the bottom
    expect(app.game.playerBoard.ships).toHaveLength(1);
    click(cell('player', 6, 9));
    expect(app.game.playerBoard.getShip('battleship').cells).toEqual([[6, 9], [7, 9], [8, 9], [9, 9]]);
  });

  it('rotates with the button and with R, but not with Ctrl+R', () => {
    setup();
    expect($('rotate-btn').textContent).toMatch(/Horizontal/);
    click($('rotate-btn'));
    expect($('rotate-btn').textContent).toMatch(/Vertical/);
    key(doc.body, 'r');
    expect($('rotate-btn').textContent).toMatch(/Horizontal/);
    key(doc.body, 'r', { ctrlKey: true });
    key(doc.body, 'R', { metaKey: true });
    expect($('rotate-btn').textContent).toMatch(/Horizontal/);
  });

  it('updates the preview immediately when rotating while hovering', () => {
    setup();
    hover(cell('player', 6, 0));
    expect(doc.querySelectorAll('#player-board .preview-ok')).toHaveLength(5);
    key(doc.body, 'R');
    expect(doc.querySelectorAll('#player-board .preview-bad')).toHaveLength(4);
  });

  it('picks a placed ship back up when it is clicked', () => {
    setup();
    click(cell('player', 0, 0));
    click(cell('player', 0, 3));
    expect(app.game.playerBoard.getShip('carrier')).toBeNull();
    expect(app.ui.selectedId).toBe('carrier');
    click(cell('player', 5, 5));
    expect(app.game.playerBoard.getShip('carrier').cells[0]).toEqual([5, 5]);
  });

  it('lets you choose any ship from the tray, including a placed one', () => {
    setup();
    click(doc.querySelector('[data-ship="destroyer"]'));
    click(cell('player', 9, 0));
    expect(app.game.playerBoard.getShip('destroyer').cells).toEqual([[9, 0], [9, 1]]);
    click(doc.querySelector('[data-ship="destroyer"]'));
    expect(app.game.playerBoard.getShip('destroyer')).toBeNull();
  });

  it('randomizes a full valid fleet each time and Clear empties it', () => {
    setup();
    const layouts = new Set();
    for (let i = 0; i < 15; i++) {
      click($('randomize-btn'));
      expect(app.game.playerBoard.ships).toHaveLength(5);
      expect(doc.querySelectorAll('#player-board .cell.ship')).toHaveLength(17);
      layouts.add(JSON.stringify(app.game.playerBoard.ships.map((s) => s.cells)));
    }
    expect(layouts.size).toBe(15);
    expect($('start-btn').disabled).toBe(false);
    click($('clear-btn'));
    expect(app.game.playerBoard.ships).toHaveLength(0);
    expect($('start-btn').disabled).toBe(true);
    expect(app.ui.selectedId).toBe('carrier');
  });

  it('ignores clicks on the enemy board before the battle', () => {
    setup();
    click(cell('computer', 0, 0));
    expect(shotsOn(app.game.computerBoard)).toBe(0);
    expect(app.game.phase).toBe('placement');
  });

  it('does nothing when Start is clicked before every ship is placed', () => {
    setup();
    click(cell('player', 0, 0));
    $('start-btn').disabled = false; // even if the button were somehow enabled
    click($('start-btn'));
    expect(app.game.phase).toBe('placement');
  });
});

describe('battle', () => {
  it('alternates turns: one player shot, then one computer shot after a delay', () => {
    setup();
    startBattle();
    expect($('placement-panel').hidden).toBe(true);
    click(cell('computer', 0, 0));
    expect(shotsOn(app.game.computerBoard)).toBe(1);
    expect(shotsOn(app.game.playerBoard)).toBe(0);
    expect(status()).toMatch(/Computer is aiming/);
    vi.advanceTimersByTime(DELAY);
    expect(shotsOn(app.game.playerBoard)).toBe(1);
    expect(app.game.turn).toBe('player');
    expect(status()).toMatch(/Your turn/);
    expect(doc.querySelectorAll('#player-board .last-shot')).toHaveLength(1);
  });

  it('does not give the player an extra turn after a hit', () => {
    setup();
    startBattle();
    const [[r, c], [r2, c2]] = app.game.computerBoard.ships[0].cells;
    click(cell('computer', r, c));
    expect(cell('computer', r, c).classList.contains('hit')).toBe(true);
    click(cell('computer', r2, c2));
    expect(shotsOn(app.game.computerBoard)).toBe(1);
    expect(status()).toMatch(/computer is taking its turn/);
  });

  it('ignores rapid repeat clicks while the computer is aiming', () => {
    setup();
    startBattle();
    for (let i = 0; i < 10; i++) click(cell('computer', i, i));
    expect(shotsOn(app.game.computerBoard)).toBe(1);
    vi.advanceTimersByTime(DELAY * 5);
    expect(shotsOn(app.game.playerBoard)).toBe(1);
  });

  it('refuses to fire at a square twice and keeps it your turn', () => {
    setup();
    startBattle();
    click(cell('computer', 3, 3));
    vi.advanceTimersByTime(DELAY);
    click(cell('computer', 3, 3));
    expect(shotsOn(app.game.computerBoard)).toBe(1);
    expect(app.game.turn).toBe('player');
    expect(status()).toMatch(/already fired at D4/);
  });

  it('ignores clicks on your own board during the battle', () => {
    setup();
    startBattle();
    const before = JSON.stringify(app.game.playerBoard.ships.map((s) => s.cells));
    click(cell('player', ...app.game.playerBoard.ships[0].cells[0]));
    key(doc.body, 'r');
    expect(JSON.stringify(app.game.playerBoard.ships.map((s) => s.cells))).toBe(before);
  });

  it('marks every square of a sunk ship with the sunk sign', () => {
    setup();
    startBattle();
    const ship = app.game.computerBoard.getShip('destroyer');
    const [[r, c], [r2, c2]] = ship.cells;
    click(cell('computer', r, c));
    vi.advanceTimersByTime(DELAY);
    expect(cell('computer', r, c).classList.contains('hit')).toBe(true);
    expect(cell('computer', r, c).classList.contains('sunk')).toBe(false);
    click(cell('computer', r2, c2));
    for (const [sr, sc] of ship.cells) {
      expect(cell('computer', sr, sc).classList.contains('sunk')).toBe(true);
      expect(cell('computer', sr, sc).classList.contains('hit')).toBe(false);
      expect(cell('computer', sr, sc).getAttribute('aria-label')).toMatch(/sunk Destroyer/);
    }
    expect(status()).toMatch(/sank the enemy Destroyer/);
    expect(doc.querySelector('#computer-fleet li.sunk').textContent).toMatch(/Destroyer/);
  });

  it('cancels the pending computer shot when New game is pressed', () => {
    setup();
    startBattle();
    click(cell('computer', 0, 0));
    click($('new-game-btn'));
    vi.advanceTimersByTime(DELAY * 3);
    expect(app.game.phase).toBe('placement');
    expect(shotsOn(app.game.playerBoard)).toBe(0);
    expect(doc.querySelectorAll('#log li')).toHaveLength(0);
    startBattle();
    expect(app.game.turn).toBe('player');
  });
});

describe('game over', () => {
  function playToWin() {
    setup(11);
    startBattle();
    const targets = app.game.computerBoard.ships.flatMap((s) => s.cells);
    for (const [r, c] of targets) {
      if (app.game.phase !== 'battle') break;
      click(cell('computer', r, c));
      vi.advanceTimersByTime(DELAY);
    }
  }

  it('declares the player the winner after sinking all ships', () => {
    playToWin();
    expect(app.game.winner).toBe('player');
    expect($('game-over').hidden).toBe(false);
    expect($('result-title').textContent).toBe('You win!');
    expect(doc.querySelectorAll('#computer-board .sunk')).toHaveLength(17);
    expect(doc.activeElement).toBe($('play-again-btn'));
  });

  it('declares the computer the winner and reveals the remaining enemy ships', () => {
    setup(12);
    startBattle();
    while (app.game.phase === 'battle') {
      click(cell('computer', ...firstUntried(app.game.computerBoard)));
      vi.advanceTimersByTime(DELAY);
    }
    expect(app.game.winner).toBe('computer');
    expect($('result-title').textContent).toBe('The computer wins');
    expect(app.game.playerBoard.allSunk()).toBe(true);
    expect(doc.querySelectorAll('#computer-board .revealed').length).toBeGreaterThan(0);
  });

  it('ignores clicks after the game ends and Play again starts fresh', () => {
    playToWin();
    const shots = shotsOn(app.game.computerBoard);
    click(cell('computer', ...firstUntried(app.game.computerBoard)));
    vi.advanceTimersByTime(DELAY);
    expect(shotsOn(app.game.computerBoard)).toBe(shots);
    click($('play-again-btn'));
    expect(app.game.phase).toBe('placement');
    expect($('game-over').hidden).toBe(true);
    expect(doc.querySelectorAll('.cell.hit, .cell.miss, .cell.sunk, .cell.ship, .cell.last-shot')).toHaveLength(0);
    expect(doc.activeElement).toBe(cell('player', 0, 0));
  });

  it('survives many quick resets in a row', () => {
    setup();
    for (let i = 0; i < 20; i++) {
      startBattle();
      click(cell('computer', 0, 0));
      click($('new-game-btn'));
    }
    vi.advanceTimersByTime(DELAY * 10);
    expect(app.game.phase).toBe('placement');
    expect(shotsOn(app.game.playerBoard)).toBe(0);
  });
});

describe('keyboard and accessibility', () => {
  const tabStops = (side) =>
    (side === 'player' ? app.playerCells : app.computerCells).flat().filter((c) => c.tabIndex === 0);

  it('has one tab stop on the active board only', () => {
    setup();
    expect(tabStops('player')).toHaveLength(1);
    expect(tabStops('computer')).toHaveLength(0);
    startBattle();
    expect(tabStops('player')).toHaveLength(0);
    expect(tabStops('computer')).toHaveLength(1);
    expect(doc.activeElement).toBe(cell('computer', 0, 0));
  });

  it('moves with arrow keys and stops at the edges', () => {
    setup();
    cell('player', 0, 0).focus();
    key(cell('player', 0, 0), 'ArrowUp');
    key(doc.activeElement, 'ArrowLeft');
    expect(doc.activeElement).toBe(cell('player', 0, 0));
    key(doc.activeElement, 'ArrowRight');
    key(doc.activeElement, 'ArrowDown');
    expect(doc.activeElement).toBe(cell('player', 1, 1));
    expect(cell('player', 1, 1).tabIndex).toBe(0);
    for (let i = 0; i < 15; i++) key(doc.activeElement, 'ArrowDown');
    expect(doc.activeElement).toBe(cell('player', 9, 1));
  });

  it('shows the placement preview on keyboard focus', () => {
    setup();
    cell('player', 2, 2).focus();
    expect(doc.querySelectorAll('#player-board .preview-ok')).toHaveLength(5);
    expect(cell('player', 2, 2).getAttribute('aria-label')).toMatch(/C3, water, Carrier fits here/);
  });

  it('labels cells so screen readers announce what is there', () => {
    setup();
    startBattle();
    const ship = app.game.playerBoard.ships[0];
    expect(cell('player', ...ship.cells[0]).getAttribute('aria-label')).toMatch(`your ${ship.name}`);
    expect(cell('computer', 0, 0).getAttribute('aria-label')).toBe('A1, not fired at');
    expect(cell('computer', 0, 0).getAttribute('aria-disabled')).toBe('false');
    click(cell('computer', 0, 0));
    expect(cell('computer', 0, 0).getAttribute('aria-label')).toMatch(/A1, (miss|hit|sunk)/);
    expect(cell('computer', 5, 5).getAttribute('aria-disabled')).toBe('true');
  });
});
