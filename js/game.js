// Pure game logic: boards, ships, rules and the computer AI. No DOM access.

export const BOARD_SIZE = 10;

export const FLEET = Object.freeze([
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Destroyer', length: 2 },
]);

export const cellKey = (row, col) => `${row},${col}`;

const randomInt = (rng, max) => Math.floor(rng() * max);

export class Ship {
  constructor(name, cells) {
    this.name = name;
    this.cells = cells;
    this.length = cells.length;
    this.hits = new Set();
  }

  hit(row, col) {
    this.hits.add(cellKey(row, col));
  }

  isSunk() {
    return this.hits.size === this.length;
  }
}

export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.reset();
  }

  reset() {
    this.ships = [];
    this.grid = Array.from({ length: this.size }, () => Array(this.size).fill(null));
    this.shots = new Set();
  }

  inBounds(row, col) {
    return (
      Number.isInteger(row) &&
      Number.isInteger(col) &&
      row >= 0 &&
      row < this.size &&
      col >= 0 &&
      col < this.size
    );
  }

  static cellsFor(row, col, length, horizontal) {
    return Array.from({ length }, (_, i) =>
      horizontal ? [row, col + i] : [row + i, col],
    );
  }

  canPlace(row, col, length, horizontal) {
    if (!Number.isInteger(length) || length < 1) return false;
    return Board.cellsFor(row, col, length, horizontal).every(
      ([r, c]) => this.inBounds(r, c) && this.grid[r][c] === null,
    );
  }

  placeShip(name, length, row, col, horizontal) {
    if (!this.canPlace(row, col, length, horizontal)) return null;
    const ship = new Ship(name, Board.cellsFor(row, col, length, horizontal));
    for (const [r, c] of ship.cells) this.grid[r][c] = ship;
    this.ships.push(ship);
    return ship;
  }

  placeFleetRandomly(fleet = FLEET, rng = Math.random) {
    for (let attempt = 0; attempt < 100; attempt++) {
      this.reset();
      const ok = fleet.every(({ name, length }) => {
        const options = [];
        for (let r = 0; r < this.size; r++) {
          for (let c = 0; c < this.size; c++) {
            if (this.canPlace(r, c, length, true)) options.push([r, c, true]);
            if (this.canPlace(r, c, length, false)) options.push([r, c, false]);
          }
        }
        if (options.length === 0) return false;
        const [r, c, horizontal] = options[randomInt(rng, options.length)];
        this.placeShip(name, length, r, c, horizontal);
        return true;
      });
      if (ok) return this.ships;
    }
    throw new Error('Could not place fleet');
  }

  shipAt(row, col) {
    return this.inBounds(row, col) ? this.grid[row][col] : null;
  }

  hasBeenShot(row, col) {
    return this.shots.has(cellKey(row, col));
  }

  receiveShot(row, col) {
    if (!this.inBounds(row, col)) throw new RangeError(`Shot out of bounds: ${row},${col}`);
    if (this.hasBeenShot(row, col)) throw new Error(`Cell already shot: ${row},${col}`);
    this.shots.add(cellKey(row, col));
    const ship = this.grid[row][col];
    if (!ship) return { result: 'miss', ship: null };
    ship.hit(row, col);
    return { result: ship.isSunk() ? 'sunk' : 'hit', ship };
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every((ship) => ship.isSunk());
  }
}

const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// Hunt and target: fire randomly until a hit, then probe neighbours, follow the
// line once two hits line up, and go back to hunting when the ship sinks.
export class HuntTargetAI {
  constructor(size = BOARD_SIZE, rng = Math.random) {
    this.size = size;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.shots = new Set();
    this.openHits = new Map();
  }

  isAvailable(row, col) {
    return (
      row >= 0 &&
      row < this.size &&
      col >= 0 &&
      col < this.size &&
      !this.shots.has(cellKey(row, col))
    );
  }

  get mode() {
    return this.openHits.size > 0 ? 'target' : 'hunt';
  }

  nextShot() {
    const shot = this.chooseTarget() ?? this.chooseHunt();
    if (!shot) throw new Error('No cells left to fire at');
    return shot;
  }

  recordResult(row, col, outcome) {
    const key = cellKey(row, col);
    if (this.shots.has(key)) throw new Error(`AI recorded a repeated shot: ${key}`);
    this.shots.add(key);
    if (outcome.result === 'hit' || outcome.result === 'sunk') {
      this.openHits.set(key, [row, col]);
    }
    if (outcome.result === 'sunk' && outcome.ship) {
      for (const [r, c] of outcome.ship.cells) this.openHits.delete(cellKey(r, c));
    }
  }

  chooseHunt() {
    const options = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.isAvailable(r, c)) options.push([r, c]);
      }
    }
    return options.length ? options[randomInt(this.rng, options.length)] : null;
  }

  chooseTarget() {
    if (this.openHits.size === 0) return null;
    const lineShot = this.lineTarget();
    if (lineShot) return lineShot;
    for (const [r, c] of this.openHits.values()) {
      const options = DIRECTIONS.map(([dr, dc]) => [r + dr, c + dc]).filter(([nr, nc]) =>
        this.isAvailable(nr, nc),
      );
      if (options.length) return options[randomInt(this.rng, options.length)];
    }
    return null;
  }

  lineTarget() {
    const isOpenHit = (r, c) => this.openHits.has(cellKey(r, c));
    for (const [r, c] of this.openHits.values()) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        let [sr, sc] = [r, c];
        while (isOpenHit(sr - dr, sc - dc)) [sr, sc] = [sr - dr, sc - dc];
        let [er, ec] = [r, c];
        while (isOpenHit(er + dr, ec + dc)) [er, ec] = [er + dr, ec + dc];
        if (sr === er && sc === ec) continue;
        const ends = [
          [er + dr, ec + dc],
          [sr - dr, sc - dc],
        ].filter(([nr, nc]) => this.isAvailable(nr, nc));
        if (ends.length) return ends[randomInt(this.rng, ends.length)];
      }
    }
    return null;
  }
}

export class Game {
  constructor({ rng = Math.random, size = BOARD_SIZE, fleet = FLEET } = {}) {
    this.rng = rng;
    this.size = size;
    this.fleet = fleet;
    this.reset();
  }

  reset() {
    this.playerBoard = new Board(this.size);
    this.computerBoard = new Board(this.size);
    this.ai = new HuntTargetAI(this.size, this.rng);
    this.phase = 'placement';
    this.turn = 'player';
    this.winner = null;
  }

  get nextShipToPlace() {
    return this.fleet[this.playerBoard.ships.length] ?? null;
  }

  get allPlayerShipsPlaced() {
    return this.playerBoard.ships.length === this.fleet.length;
  }

  placePlayerShip(row, col, horizontal) {
    if (this.phase !== 'placement') return null;
    const next = this.nextShipToPlace;
    if (!next) return null;
    return this.playerBoard.placeShip(next.name, next.length, row, col, horizontal);
  }

  randomizePlayerShips() {
    if (this.phase !== 'placement') return;
    this.playerBoard.placeFleetRandomly(this.fleet, this.rng);
  }

  clearPlayerShips() {
    if (this.phase !== 'placement') return;
    this.playerBoard.reset();
  }

  start() {
    if (this.phase !== 'placement') throw new Error('Game already started');
    if (!this.allPlayerShipsPlaced) throw new Error('Place all ships before starting');
    this.computerBoard.placeFleetRandomly(this.fleet, this.rng);
    this.phase = 'battle';
    this.turn = 'player';
  }

  playerFire(row, col) {
    if (this.phase !== 'battle') throw new Error('Game is not in progress');
    if (this.turn !== 'player') throw new Error("It is not the player's turn");
    const outcome = this.computerBoard.receiveShot(row, col);
    this.endTurn(this.computerBoard, 'player', 'computer');
    return outcome;
  }

  computerFire() {
    if (this.phase !== 'battle') throw new Error('Game is not in progress');
    if (this.turn !== 'computer') throw new Error("It is not the computer's turn");
    const [row, col] = this.ai.nextShot();
    const outcome = this.playerBoard.receiveShot(row, col);
    this.ai.recordResult(row, col, outcome);
    this.endTurn(this.playerBoard, 'computer', 'player');
    return { row, col, ...outcome };
  }

  endTurn(targetBoard, shooter, opponent) {
    if (targetBoard.allSunk()) {
      this.phase = 'over';
      this.winner = shooter;
    } else {
      this.turn = opponent;
    }
  }
}
