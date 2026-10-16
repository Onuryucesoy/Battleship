import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs the random-command fuzzer in its own process (it replaces the global timers).
describe('fuzz', () => {
  it('survives random commands in every phase for a few full games', () => {
    const out = execFileSync('node', [resolve(__dirname, '../scripts/fuzz.js'), '5', '7'], { encoding: 'utf8' });
    const report = JSON.parse(out);
    expect(report.failureCount).toBe(0);
    expect(report.games).toBe(5);
  }, 120000);
});
