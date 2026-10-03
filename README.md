# Battleship

Classic Battleship in the browser against a computer opponent. Plain HTML, CSS and JavaScript with no framework and no build step, so it runs directly on GitHub Pages.

**Play:** https://onuryucesoy.github.io/Battleship/

## How to play

1. **Place your fleet** on the left board: Carrier (5), Battleship (4), Cruiser (3), Submarine (3) and Destroyer (2), in that order.
   - Hover to preview (green = valid, red = invalid) and click to place.
   - **Rotate** (or press `R`) switches between horizontal and vertical.
   - **Randomize** places the whole fleet for you. **Clear** removes all ships.
   - Ships can't overlap or go off the board.
2. Press **Start Game**. The computer places its fleet randomly, hidden from you.
3. **Fire** by clicking a cell on the Enemy Waters board. You and the computer take one shot each in turn. A hit does not give an extra turn.
   - White dot = miss, red ✕ = hit, dark red outlined ✕ = sunk ship. Sunk ships are also crossed out in the fleet lists.
   - The computer's last shot is outlined in yellow on your board.
4. Sink all five enemy ships to win. When the game ends the remaining enemy ships are revealed, and **Play Again** fully resets the game.

**Keyboard:** everything works with `Tab` and `Enter`. While placing, a focused cell shows the same preview as hovering. After **Start Game**, focus jumps to the enemy board, and only the board you can act on is in the tab order.

### Computer opponent

The AI uses hunt and target. It fires at random untried cells until it scores a hit, then probes the neighbouring cells, follows the line once two hits line up, and returns to hunting after the ship sinks. If it hits another ship along the way, it finishes that one too before hunting again. It never fires at the same cell twice.

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
npm test            # Vitest unit tests (tests/game.test.js, tests/ui.test.js)
npm run simulate    # 1,000 full AI-vs-AI games
```

`npm run simulate -- <games> <seed>` changes the number of games or the seed, e.g. `npm run simulate -- 5000 42`. The script exits non-zero if any game throws, repeats a shot or ends without a winner.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Page markup |
| `css/style.css` | Styles |
| `js/game.js` | Game logic: `Board`, `Ship`, `HuntTargetAI`, `Game` (no DOM) |
| `js/ui.js` | DOM rendering and event handling |
| `tests/game.test.js` | Unit tests for the game logic and AI |
| `tests/ui.test.js` | UI tests in jsdom (keyboard focus and preview) |
| `scripts/simulate.js` | AI-vs-AI simulation |
| `BUGS.md` | Bugs found during development |
