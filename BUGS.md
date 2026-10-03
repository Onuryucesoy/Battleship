# Bugs found during development

Only bugs that actually happened are listed here. The game-logic unit tests and the AI-vs-AI simulation (1,000 games by default, plus a 10,000-game run) passed on their first run and found no bugs. All three bugs below came from playtesting in the browser. A deliberate edge-case pass found nothing else: rapid clicks and clicks during the computer's turn, enemy-board clicks during placement and after game over, repeat shots, Randomize after manual placement, every edge and corner in both orientations, repeated Play Again, and resizing mid-game.

## 1. Hovered cell lost its placement preview colour

- **What went wrong:** While placing a ship, the cell under the mouse pointer showed as dark navy instead of green or red. Only the other cells of the ship preview were coloured, so the ship looked one cell shorter than it really was.
- **How it was found:** Playtest. Placing the Cruiser vertically at G5 showed only H5 and I5 in green.
- **Root cause:** Board cells are `<button>` elements. The general rule `button:hover:not(:disabled)` (specificity 0,2,1) beat `.cell.preview` (0,2,0), so the generic button hover background replaced the preview colour. The same rule would also have hidden the hit, sunk and ship colours on any hovered cell.
- **Fix:** Limited the generic hover rule to non-cell buttons: `button:not(.cell):hover:not(:disabled)` in `css/style.css`. Retested: the hovered cell now shows the preview colour.

## 2. No placement preview when using the keyboard

- **What went wrong:** When you Tab to a cell on your board, the cell got a focus ring but no ship preview, so you couldn't see where the ship would go before pressing Enter.
- **How it was found:** Playtest (keyboard-only). Tabbing to A1 showed 0 preview cells; hovering with the mouse showed 5.
- **Root cause:** `hoverCell` was only set from `mouseover`, so keyboard focus never updated it.
- **Fix:** `js/ui.js` also sets `hoverCell` on `focusin` and clears it on `focusout`. Test: `tests/ui.test.js`, "shows the placement preview when a cell gets keyboard focus".

## 3. Keyboard focus got stuck on hidden buttons and inactive cells

- **What went wrong:** After Enter on Start Game, focus stayed on the now-hidden Start button. It then took 101 Tab presses to reach the enemy board, because all 100 cells of your own board were still tab stops even though they can't be used in battle. Play Again had the same problem: when the game ended you had to Tab back up to the button, and after pressing it, focus was lost again.
- **How it was found:** Playtest (keyboard-only).
- **Root cause:** Every cell was always a focusable `<button>`, and nothing moved focus when the controls under it were hidden.
- **Fix:** In `render()` only the active board's cells are focusable (`tabIndex` 0, the inactive board gets -1). Focus now moves to enemy A1 on Start, to Play Again when the game ends, and to Rotate after Play Again. Tests: three cases in `tests/ui.test.js`.
