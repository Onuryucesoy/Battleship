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

## Checks we ran

The fuzz test, the Player A vs Player B runs and the fault-injection checks found no further bugs. The table lists every check and its result.

| Check | How to run | Result |
| --- | --- | --- |
| Automated tests (rules, AI, game flow, page UI, short fuzz) | `npm test` | 59 tests, all passing |
| AI strength: 1,000 games per AI, seed 12345 | `npm run simulate` | Average shots to sink a fleet: 45.0 for `ProbabilityAI`, 61.0 for `HuntTargetAI` and 95.4 for `RandomAI`. Head to head, `ProbabilityAI` won 79.1% |
| Player A vs Player B: 1,000 full games through the real game engine, both players using the game's AI, rules checked on every shot | `npm run ab` | Seed 2026: A won 494 (49.4%), B won 506 (50.6%), 0 failures. Seed 777: 52.6% / 47.4%, 0 failures |
| Moves needed to win (same sample, seed 2026) | `npm run ab` sample | The winner needed 39.6 shots on average (median 39, fastest 23, slowest 68). A needed 39.3 and B 39.9. A whole game took 78.7 shots for both players together |
| Random-command fuzz: 1,000 games on the real game screen, seed 4242, rules and screen checked after every action | `npm run fuzz` | 475,473 actions, player won 386, computer won 614, 183 battles restarted midway, 0 failures |
| Random clicking in real Chrome: 25 games, window resized from 320 to 1400px | Playwright over CDP | 15,859 actions, 0 failures, no console errors, no sideways scrolling |
| Manual browser play: mouse only, keyboard only, double clicks, phone to desktop widths | Chrome | No problems after bugs 1–3 were fixed |
| Fault injection (do the checks catch real bugs?) | Temporary code changes, reverted | The old overlap bug was caught by the fuzz test within 5 games. An extra turn after a hit was caught by both `ab` and `fuzz`. A repeated shot was caught by `ab` |
| Play-testing by the user | Browser | Found bug 4, now fixed |
