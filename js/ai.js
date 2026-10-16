// Computer opponents. They only see what a human would: where they fired, whether
// it was a miss or a hit, and which squares a ship covered once it is sunk.
import { BOARD_SIZE, FLEET, cellKey, randomInt } from './rules.js';

// Placements that line up with more unresolved hits are far more likely to be
// the real ship, so each extra hit covered multiplies the weight.
const HIT_WEIGHT = 30;

class BaseAI {
  constructor({ size = BOARD_SIZE, fleet = FLEET, rng = Math.random } = {}) {
    this.size = size;
    this.fleet = fleet;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.shots = new Map();
    this.sunkCells = new Set();
    this.remaining = this.fleet.map((def) => def);
  }

  isUntried(row, col) {
    return (
      row >= 0 && row < this.size && col >= 0 && col < this.size && !this.shots.has(cellKey(row, col))
    );
  }

  untriedCells() {
    const cells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) if (this.isUntried(r, c)) cells.push([r, c]);
    }
    return cells;
  }

  unresolvedHits() {
    const hits = [];
    for (const [key, result] of this.shots) {
      if (result === 'hit' && !this.sunkCells.has(key)) hits.push(key.split(',').map(Number));
    }
    return hits;
  }

  recordResult(row, col, outcome) {
    const key = cellKey(row, col);
    if (this.shots.has(key)) throw new Error(`AI fired at the same square twice: ${key}`);
    this.shots.set(key, outcome.result === 'miss' ? 'miss' : 'hit');
    if (outcome.result === 'sunk' && outcome.ship) {
      for (const [r, c] of outcome.ship.cells) this.sunkCells.add(cellKey(r, c));
      this.remaining = this.remaining.filter((def) => def.id !== outcome.ship.id);
    }
  }

  nextShot() {
    const shot = this.chooseShot();
    if (!shot || !this.isUntried(shot[0], shot[1])) throw new Error('AI has no valid square to fire at');
    return shot;
  }

  pickRandom(cells) {
    return cells.length ? cells[randomInt(this.rng, cells.length)] : null;
  }
}

// Probability targeting. For every ship still afloat it counts each way the ship
// could lie on the board without crossing a miss or a sunk ship. Each untried
// square scores the number of placements covering it, and the AI fires at the
// highest score. When there are hits on ships not yet sunk, only placements
// through those hits count, so it searches next to them and then follows the line.
export class ProbabilityAI extends BaseAI {
  heatMap() {
    const n = this.size;
    // 0 = untried, 1 = miss or sunk ship (no ship can lie here), 2 = hit on a ship still afloat
    const state = new Int8Array(n * n);
    for (const [key, result] of this.shots) {
      const [r, c] = key.split(',').map(Number);
      state[r * n + c] = result === 'miss' || this.sunkCells.has(key) ? 1 : 2;
    }
    const targeting = state.includes(2);
    const heat = new Float64Array(n * n);

    for (const { length } of this.remaining) {
      for (const [dr, dc] of length === 1 ? [[0, 1]] : [[0, 1], [1, 0]]) {
        for (let r = 0; r + dr * (length - 1) < n; r++) {
          for (let c = 0; c + dc * (length - 1) < n; c++) {
            let covered = 0;
            let possible = true;
            for (let i = 0; i < length; i++) {
              const s = state[(r + dr * i) * n + c + dc * i];
              if (s === 1) {
                possible = false;
                break;
              }
              if (s === 2) covered++;
            }
            if (!possible || (targeting && covered === 0)) continue;
            const weight = targeting ? HIT_WEIGHT ** covered : 1;
            for (let i = 0; i < length; i++) {
              const idx = (r + dr * i) * n + c + dc * i;
              if (state[idx] === 0) heat[idx] += weight;
            }
          }
        }
      }
    }
    return Array.from({ length: n }, (_, r) => Array.from(heat.subarray(r * n, (r + 1) * n)));
  }

  chooseShot() {
    const heat = this.heatMap();
    let best = 0;
    let candidates = [];
    for (const [r, c] of this.untriedCells()) {
      if (heat[r][c] > best) {
        best = heat[r][c];
        candidates = [[r, c]];
      } else if (heat[r][c] === best && best > 0) {
        candidates.push([r, c]);
      }
    }
    return this.pickRandom(candidates) ?? this.pickRandom(this.untriedCells());
  }
}

// Baseline used only by the simulation: random hunting, then neighbours and lines.
export class HuntTargetAI extends BaseAI {
  chooseShot() {
    const hits = this.unresolvedHits();
    const hitKeys = new Set(hits.map(([r, c]) => cellKey(r, c)));
    for (const [r, c] of hits) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        if (!hitKeys.has(cellKey(r + dr, c + dc))) continue;
        let [er, ec] = [r, c];
        while (hitKeys.has(cellKey(er + dr, ec + dc))) [er, ec] = [er + dr, ec + dc];
        let [sr, sc] = [r, c];
        while (hitKeys.has(cellKey(sr - dr, sc - dc))) [sr, sc] = [sr - dr, sc - dc];
        const ends = [
          [er + dr, ec + dc],
          [sr - dr, sc - dc],
        ].filter(([nr, nc]) => this.isUntried(nr, nc));
        if (ends.length) return this.pickRandom(ends);
      }
    }
    for (const [r, c] of hits) {
      const around = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ].filter(([nr, nc]) => this.isUntried(nr, nc));
      if (around.length) return this.pickRandom(around);
    }
    return this.pickRandom(this.untriedCells());
  }
}

// Baseline used only by the simulation: fires at random untried squares.
export class RandomAI extends BaseAI {
  chooseShot() {
    return this.pickRandom(this.untriedCells());
  }
}
