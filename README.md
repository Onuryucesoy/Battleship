# Battleship

Classic Battleship in the browser, you against a computer that plays to win. Plain HTML, CSS and JavaScript with no framework and no build step, so it runs directly on GitHub Pages.

**Play:** https://onuryucesoy.github.io/Battleship/

## Rules

- Each side has a 10 × 10 board and five ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3) and Destroyer (2).
- Ships lie horizontally or vertically. They can't overlap or go off the board.
- The computer places its fleet randomly at the start of every game.
- Players alternate turns, one shot each. A hit does **not** give an extra turn.
- A hit is marked ✕. Once every square of a ship is hit, the whole ship is marked ☠ as sunk, and it is crossed out in the fleet list.
- The first side to sink all five enemy ships wins.

## How to play

1. **Place your fleet** on *Your fleet*. Pick a ship in the tray (the next unplaced one is picked for you), then click a square. The ship starts at that square and runs right (horizontal) or down (vertical).
   - Hover over a square to preview: green fits, red doesn't.
   - **Rotate** (or press `R`) switches between horizontal and vertical.
   - **Randomize** places the whole fleet for you, following the same rules. Press it again for a new layout.
   - Squares that already hold a ship are refused, so a new ship can never replace or overlap one you placed.
   - To move a placed ship, pick it in the tray: it comes off the board and you place it again. **Clear** removes every ship.
2. Press **Start battle**.
3. **Fire** by clicking a square in *Enemy waters*. The computer answers with one shot after a short pause. Its latest shot is outlined in yellow on your board.
4. When the game ends, the computer's remaining ships are shown with dashed outlines. **Play again** starts a new game. **New game** abandons the current one.

**Keyboard:** `Tab` moves to a board, the arrow keys move around it, and `Enter` or `Space` places a ship or fires. Each board is a single tab stop, and only the board you can act on is reachable.

## The computer opponent

The computer (`ProbabilityAI` in `js/ai.js`) uses probability targeting. It only knows what you would know in its seat: where it fired, whether each shot was a miss or a hit, and which squares a ship covered once it is sunk. It never looks at your board.

Before every shot it counts each way every ship still afloat could lie on the board without crossing a miss or a sunk ship. Each untried square scores the number of placements that cover it, and the AI fires at the highest-scoring square (ties are broken at random).

- **Hunting** (no open hits): the scores naturally favour the open middle of the board and skip pockets too small for any remaining ship.
- **Targeting** (a hit on a ship not yet sunk): only placements through that hit count, so it fires at the adjacent squares. Once two hits line up, placements along that line score far higher, so it follows the line and turns around when it reaches a miss.
- It never fires at the same square twice.

From `npm run simulate` (1,000 games, seed 12345):

| AI | Average shots to sink a random fleet |
| --- | --- |
| `ProbabilityAI` (the opponent you play) | 45.0 |
| `HuntTargetAI` (random search, then neighbours) | 61.0 |
| `RandomAI` | 95.4 |

Head to head, alternating who shoots first, `ProbabilityAI` beats `HuntTargetAI` in about 79% of games.

## Run locally

The game uses ES modules, and browsers block those on pages opened straight from the file system (`file://`), so **opening `index.html` by double-clicking will not work**. Serve the folder with any simple static server instead, from the repo root:

```bash
# Option 1: Python (no install needed on most systems)
python3 -m http.server 8000
# then open http://localhost:8000/

# Option 2: Node.js
npx serve .
# then open the URL it prints (usually http://localhost:3000/)
```

`npm start` is a shortcut for the Python command.

## Tests

Requires Node.js 18+.

```bash
npm install
npm test            # Vitest: rules, AI, game flow and jsdom UI tests
npm run simulate    # 1,000 games per AI plus head to head
```

`npm run simulate -- <games> <seed>` changes the number of games or the seed, e.g. `npm run simulate -- 5000 42`. The script exits non-zero if any AI repeats a square, fires off the board or a game fails to end.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Page markup |
| `css/style.css` | Styles, including the narrow-screen layout |
| `js/rules.js` | Board, fleet, placement and shots (no DOM) |
| `js/ai.js` | `ProbabilityAI` opponent, plus `HuntTargetAI` and `RandomAI` baselines for the simulation |
| `js/game.js` | Game flow: placement, alternating turns, game over (no DOM) |
| `js/ui.js` | Rendering and input (mouse, touch, keyboard) |
| `js/main.js` | Entry point |
| `tests/` | Vitest tests: `rules`, `ai`, `game`, and `ui` (jsdom edge cases) |
| `scripts/simulate.js` | AI simulation and benchmark |
| `BUGS.md` | Bugs found during development |
