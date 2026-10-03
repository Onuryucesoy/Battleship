# Bugs found during development

Only bugs that actually happened are listed here. The unit tests (19) and the AI-vs-AI simulation (1,000 games by default, plus a 10,000-game run) passed on their first run and found no bugs. The one bug below came from playtesting in the browser.

## 1. Hovered cell lost its placement preview colour

- **What went wrong:** While placing a ship, the cell under the mouse pointer showed as dark navy instead of green or red. Only the other cells of the ship preview were coloured, so the ship looked one cell shorter than it really was.
- **How it was found:** Playtest. Placing the Cruiser vertically at G5 showed only H5 and I5 in green.
- **Root cause:** Board cells are `<button>` elements. The general rule `button:hover:not(:disabled)` (specificity 0,2,1) beat `.cell.preview` (0,2,0), so the generic button hover background replaced the preview colour. The same rule would also have hidden the hit, sunk and ship colours on any hovered cell.
- **Fix:** Limited the generic hover rule to non-cell buttons: `button:not(.cell):hover:not(:disabled)` in `css/style.css`. Retested: the hovered cell now shows the preview colour.
