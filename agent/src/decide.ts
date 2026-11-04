export type Decision = { action: 'hold' | 'exit'; reason: 'none' | 'deadline' | 'health' }

// Mirrors Bucket.canExit(): reason 1 (deadline) is checked before 2 (health). The contract stays the
// source of truth; the agent re-checks canExit() onchain before it sends anything.
// health is 1e18-scaled; Aave reports type(uint256).max when there is no debt, so the health rule holds.
export function decide(
  position: { health: bigint; debt: bigint },
  rules: { deadline: bigint; minHealth: bigint },
  nowSec: bigint,
): Decision {
  if (rules.deadline !== 0n && nowSec >= rules.deadline) return { action: 'exit', reason: 'deadline' }
  if (rules.minHealth !== 0n && position.health < rules.minHealth) return { action: 'exit', reason: 'health' }
  return { action: 'hold', reason: 'none' }
}
