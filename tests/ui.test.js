// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

const cells = (boardId) => [...document.querySelectorAll(`#${boardId} .cell`)];
const tabStops = (boardId) => cells(boardId).filter((el) => el.tabIndex >= 0).length;
const phaseOver = () => !document.getElementById('game-over').hidden;

beforeAll(async () => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  vi.useFakeTimers();
  await import('../js/ui.js');
});

// The tests share one page and run in order: placement -> battle -> game over -> Play Again.
describe('keyboard play', () => {
  it('shows the placement preview when a cell gets keyboard focus', () => {
    cells('player-board')[0].focus();
    expect(document.querySelectorAll('#player-board .cell.preview')).toHaveLength(5);
  });

  it('only makes the active board reachable with Tab during placement', () => {
    expect(tabStops('player-board')).toBe(100);
    expect(tabStops('computer-board')).toBe(0);
  });

  it('moves focus to the enemy board on Start and skips the inactive player board', () => {
    document.getElementById('randomize-btn').click();
    document.getElementById('start-btn').click();
    expect(document.activeElement).toBe(cells('computer-board')[0]);
    expect(tabStops('player-board')).toBe(0);
    expect(tabStops('computer-board')).toBe(100);
  });

  it('focuses Play Again when the game ends, and Rotate after it is pressed', () => {
    for (const cell of cells('computer-board')) {
      if (phaseOver()) break;
      cell.click();
      vi.advanceTimersByTime(600);
    }
    expect(phaseOver()).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('play-again-btn'));
    expect(tabStops('computer-board')).toBe(0);

    document.getElementById('play-again-btn').click();
    expect(document.activeElement).toBe(document.getElementById('rotate-btn'));
    expect(tabStops('player-board')).toBe(100);
    expect(document.querySelectorAll('#player-board .cell.ship')).toHaveLength(0);
  });
});
