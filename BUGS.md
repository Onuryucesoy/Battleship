# Bugs found during development

Only bugs that actually happened while building this version are listed.

## 1. Revealed enemy ships had an invalid outline style

- **Symptom:** at game over, the squares of enemy ships you hadn't found were meant to get a dashed outline, but the `box-shadow` rule for `.cell.revealed` was ignored.
- **How found:** reviewing the stylesheet after the first browser screenshots.
- **Root cause:** `box-shadow: inset 0 0 0 2px dashed` isn't valid CSS (box shadows have no line style), so the browser dropped the declaration.
- **Fix:** removed it. The dashed outline comes from the `outline: 2px dashed` rule alone.

## 2. Console error on every page load

- **Symptom:** the browser console logged `Failed to load resource: 404` on page load.
- **How found:** collecting console errors while playing full games in Chrome with Playwright.
- **Root cause:** the page had no icon, so the browser requested `/favicon.ico`, which doesn't exist.
- **Fix:** added an inline SVG anchor icon in `index.html`. No more console errors.

## 3. Simulation was too slow to run often

- **Symptom:** `npm run simulate` took about 33 seconds for 1,000 games per AI.
- **How found:** the first simulation run.
- **Root cause:** `ProbabilityAI.heatMap()` built string keys for every square of every candidate placement, on every shot.
- **Fix:** it now builds one typed-array snapshot of the board per shot and indexes it by number. Same choices, same results, and the run takes about 5 seconds.

## 4. Clicking a placed ship removed it while placing another ship

- **Symptom:** with a ship selected, clicking a square that already held a ship took that placed ship off the board instead of refusing the new ship.
- **How found:** reported by the user while play-testing.
- **Root cause:** a click on an occupied square was treated as "pick this ship up", which wins over placing the selected ship.
- **Fix:** board clicks on an occupied square are now always refused with a "Ships can't overlap" message. Ships are moved only by picking them in the ship tray. Covered by `tests/ui.test.js`.
