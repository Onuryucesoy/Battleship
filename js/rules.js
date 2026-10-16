// Board rules: fleet, ship placement and shots. No DOM access.

export const BOARD_SIZE = 10;

export const FLEET = Object.freeze([
  Object.freeze({ id: 'carrier', name: 'Carrier', length: 5 }),
  Object.freeze({ id: 'battleship', name: 'Battleship', length: 4 }),
  Object.freeze({ id: 'cruiser', name: 'Cruiser', length: 3 }),
  Object.freeze({ id: 'submarine', name: 'Submarine', length: 3 }),
  Object.freeze({ id: 'destroyer', name: 'Destroyer', length: 2 }),
]);

export const cellKey = (row, col) => `${row},${col}`;

export const randomInt = (rng, max) => Math.floor(rng() * max);

export function cellsFor(row, col, length, horizontal) {
  return Array.from({ length }, (_, i) => (horizontal ? [row, col + i] : [row + i, col]));
}

export class Ship {
  constructor(def, cells, horizontal) {
    this.id = def.id;
    this.name = def.name;
    this.length = def.length;
    this.cells = cells;
    this.horizontal = horizontal;
    this.hits = new Set();
  }

  get isSunk() {
    return this.hits.size === this.length;
  }
}

export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.clear();
  }

  clear() {
    this.ships = [];
    this.grid = Array.from({ length: this.size }, () => Array(this.size).fill(null));
    this.shots = new Map();
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

  canPlace(length, row, col, horizontal) {
    if (!Number.isInteger(length) || length < 1) return false;
    return cellsFor(row, col, length, horizontal).every(
      ([r, c]) => this.inBounds(r, c) && this.grid[r][c] === null,
    );
  }

  getShip(id) {
    return this.ships.find((ship) => ship.id === id) ?? null;
  }

  placeShip(def, row, col, horizontal) {
    if (this.getShip(def.id)) return null;
    if (!this.canPlace(def.length, row, col, horizontal)) return null;
    const ship = new Ship(def, cellsFor(row, col, def.length, horizontal), horizontal);
    for (const [r, c] of ship.cells) this.grid[r][c] = ship;
    this.ships.push(ship);
    return ship;
  }

  removeShip(id) {
    const ship = this.getShip(id);
    if (!ship) return null;
    for (const [r, c] of ship.cells) this.grid[r][c] = null;
    this.ships = this.ships.filter((s) => s !== ship);
    return ship;
  }

  placeFleetRandomly(fleet = FLEET, rng = Math.random) {
    for (let attempt = 0; attempt < 200; attempt++) {
      this.clear();
      const placedAll = fleet.every((def) => {
        const options = [];
        for (let r = 0; r < this.size; r++) {
          for (let c = 0; c < this.size; c++) {
            for (const horizontal of [true, false]) {
              if (this.canPlace(def.length, r, c, horizontal)) options.push([r, c, horizontal]);
            }
          }
        }
        if (options.length === 0) return false;
        const [r, c, horizontal] = options[randomInt(rng, options.length)];
        return this.placeShip(def, r, c, horizontal) !== null;
      });
      if (placedAll) return this.ships;
    }
    throw new Error('Could not place the fleet');
  }

  shipAt(row, col) {
    return this.inBounds(row, col) ? this.grid[row][col] : null;
  }

  shotAt(row, col) {
    return this.shots.get(cellKey(row, col)) ?? null;
  }

  receiveShot(row, col) {
    if (!this.inBounds(row, col)) throw new RangeError(`Shot off the board: ${row},${col}`);
    if (this.shots.has(cellKey(row, col))) throw new Error(`Square already fired at: ${row},${col}`);
    const ship = this.grid[row][col];
    this.shots.set(cellKey(row, col), ship ? 'hit' : 'miss');
    if (!ship) return { result: 'miss', ship: null };
    ship.hits.add(cellKey(row, col));
    return { result: ship.isSunk ? 'sunk' : 'hit', ship };
  }

  allSunk() {
    return this.ships.length > 0 && this.ships.every((ship) => ship.isSunk);
  }
}
