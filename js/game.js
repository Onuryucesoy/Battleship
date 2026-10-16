// Game flow: placement, alternating turns and the end of the game. No DOM access.
import { BOARD_SIZE, Board, FLEET } from './rules.js';
import { ProbabilityAI } from './ai.js';

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
    this.ai = new ProbabilityAI({ size: this.size, fleet: this.fleet, rng: this.rng });
    this.phase = 'placement';
    this.turn = 'player';
    this.winner = null;
    this.stats = { player: { shots: 0, hits: 0 }, computer: { shots: 0, hits: 0 } };
  }

  get unplacedShips() {
    return this.fleet.filter((def) => !this.playerBoard.getShip(def.id));
  }

  get allShipsPlaced() {
    return this.unplacedShips.length === 0;
  }

  placePlayerShip(id, row, col, horizontal) {
    if (this.phase !== 'placement') return null;
    const def = this.fleet.find((d) => d.id === id);
    if (!def) return null;
    return this.playerBoard.placeShip(def, row, col, horizontal);
  }

  removePlayerShip(id) {
    if (this.phase !== 'placement') return null;
    return this.playerBoard.removeShip(id);
  }

  randomizePlayerShips() {
    if (this.phase !== 'placement') return;
    this.playerBoard.placeFleetRandomly(this.fleet, this.rng);
  }

  clearPlayerShips() {
    if (this.phase !== 'placement') return;
    this.playerBoard.clear();
  }

  start() {
    if (this.phase !== 'placement') throw new Error('The game has already started');
    if (!this.allShipsPlaced) throw new Error('Place all your ships first');
    this.computerBoard.placeFleetRandomly(this.fleet, this.rng);
    this.phase = 'battle';
    this.turn = 'player';
  }

  canPlayerFire(row, col) {
    return (
      this.phase === 'battle' &&
      this.turn === 'player' &&
      this.computerBoard.inBounds(row, col) &&
      this.computerBoard.shotAt(row, col) === null
    );
  }

  playerFire(row, col) {
    if (this.phase !== 'battle') throw new Error('The game is not in progress');
    if (this.turn !== 'player') throw new Error("It is not the player's turn");
    const outcome = this.computerBoard.receiveShot(row, col);
    this.finishTurn('player', outcome);
    return { row, col, ...outcome };
  }

  computerFire() {
    if (this.phase !== 'battle') throw new Error('The game is not in progress');
    if (this.turn !== 'computer') throw new Error("It is not the computer's turn");
    const [row, col] = this.ai.nextShot();
    const outcome = this.playerBoard.receiveShot(row, col);
    this.ai.recordResult(row, col, outcome);
    this.finishTurn('computer', outcome);
    return { row, col, ...outcome };
  }

  // Every shot ends the turn, hit or miss.
  finishTurn(shooter, outcome) {
    const stats = this.stats[shooter];
    stats.shots++;
    if (outcome.result !== 'miss') stats.hits++;
    const target = shooter === 'player' ? this.computerBoard : this.playerBoard;
    if (target.allSunk()) {
      this.phase = 'over';
      this.winner = shooter;
    } else {
      this.turn = shooter === 'player' ? 'computer' : 'player';
    }
  }
}
