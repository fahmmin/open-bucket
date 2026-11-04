import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPct, fmtHealth } from '../src/util.ts'

test('health is shown with two decimals, truncated (0.999 is not "1.00")', () => {
  assert.equal(fmtHealth(1_429_000_000_000_000_000n), '1.42')
  assert.equal(fmtHealth(999_999_999_999_999_999n), '0.99')
  assert.equal(fmtHealth(10n ** 18n), '1.00')
})

test('no debt (max uint) is "Infinity", which Number() parses', () => {
  assert.equal(fmtHealth(2n ** 256n - 1n), 'Infinity')
  assert.equal(Number(fmtHealth(2n ** 256n - 1n)), Infinity)
})

test('applyPct moves a price by pct percent, two decimals allowed', () => {
  assert.equal(applyPct(200_000_000n, -4), 192_000_000n)
  assert.equal(applyPct(200_000_000n, 2.5), 205_000_000n)
  assert.equal(applyPct(200_000_000n, 0), 200_000_000n)
})
