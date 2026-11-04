import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide } from '../src/decide.ts'

const E18 = 10n ** 18n
const MAX = 2n ** 256n - 1n // what Aave reports as health when there is no debt
const NOW = 1_800_000_000n
const healthy = { health: 2n * E18, debt: 1000n * 10n ** 6n }
const noRules = { deadline: 0n, minHealth: 0n }

test('no rules set: hold', () => {
  assert.deepEqual(decide(healthy, noRules, NOW), { action: 'hold', reason: 'none' })
})

test('deadline 0 means no deadline rule, even with health 0', () => {
  assert.deepEqual(decide({ health: 0n, debt: 1n }, noRules, NOW), { action: 'hold', reason: 'none' })
})

test('deadline in the future: hold', () => {
  assert.deepEqual(decide(healthy, { deadline: NOW + 1n, minHealth: 0n }, NOW), { action: 'hold', reason: 'none' })
})

test('deadline exactly now: exit (now >= deadline)', () => {
  assert.deepEqual(decide(healthy, { deadline: NOW, minHealth: 0n }, NOW), { action: 'exit', reason: 'deadline' })
})

test('deadline in the past: exit', () => {
  assert.deepEqual(decide(healthy, { deadline: NOW - 60n, minHealth: 0n }, NOW), { action: 'exit', reason: 'deadline' })
})

test('health above the floor: hold', () => {
  const rules = { deadline: 0n, minHealth: (115n * E18) / 100n }
  assert.deepEqual(decide(healthy, rules, NOW), { action: 'hold', reason: 'none' })
})

test('health exactly at the floor: hold (rule is strictly below)', () => {
  const floor = (115n * E18) / 100n
  assert.deepEqual(decide({ health: floor, debt: 1n }, { deadline: 0n, minHealth: floor }, NOW), {
    action: 'hold',
    reason: 'none',
  })
})

test('health one wei below the floor: exit for health', () => {
  const floor = (115n * E18) / 100n
  assert.deepEqual(decide({ health: floor - 1n, debt: 1n }, { deadline: 0n, minHealth: floor }, NOW), {
    action: 'exit',
    reason: 'health',
  })
})

test('no debt (health is max uint): hold even with a health rule', () => {
  assert.deepEqual(decide({ health: MAX, debt: 0n }, { deadline: 0n, minHealth: 2n * E18 }, NOW), {
    action: 'hold',
    reason: 'none',
  })
})

test('both rules true: deadline wins (reason 1 before 2, like canExit)', () => {
  const rules = { deadline: NOW, minHealth: 2n * E18 }
  assert.deepEqual(decide({ health: E18, debt: 1n }, rules, NOW), { action: 'exit', reason: 'deadline' })
})

test('future deadline does not mask a health exit', () => {
  const rules = { deadline: NOW + 3600n, minHealth: 2n * E18 }
  assert.deepEqual(decide({ health: E18, debt: 1n }, rules, NOW), { action: 'exit', reason: 'health' })
})
