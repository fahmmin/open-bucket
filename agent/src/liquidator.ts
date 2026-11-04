// Liquidates the plain Aave position (PLAIN_POSITION) as soon as its health drops below 1.00, like any
// Aave liquidator would. Fork: real Aave, anvil dev account #3. Testnet: our test pool, LIQUIDATOR_KEY.
import { maxUint256, type Abi, type Address, type PublicClient, type WalletClient } from 'viem'
import { erc20Abi, oracleAbi, poolAbi } from './abi.ts'
import { errMsg, fmtHealth, mined, sendTx, type AgentEvent } from './util.ts'

type Addrs = { pool: Address; oracle: Address; collateral: Address; usdc: Address; user: Address }

export function makeLiquidator(client: PublicClient, wallet: () => Promise<WalletClient>, a: Addrs, emit: (e: AgentEvent) => void) {
  const read = (address: Address, abi: Abi, functionName: string, args: unknown[] = []) =>
    client.readContract({ address, abi, functionName, args } as never) as Promise<any>

  // Gets enough USDC to repay the plain position's whole debt: supplies the collateral it holds (WETH; on the
  // fork contracts/script/fork-fund.sh funds account #3, on testnet use TestWETH.faucet()) and borrows USDC.
  // Idempotent, so it is safe to rerun after a fork reset.
  async function prepare() {
    const w = await wallet()
    const me = w.account!.address
    const send = async (address: Address, abi: Abi, functionName: string, args: unknown[]) =>
      mined(client, await sendTx(client, w, { address, abi, functionName, args }))
    const [, debtBase] = await read(a.pool, poolAbi, 'getUserAccountData', [a.user])
    if (debtBase === 0n) return console.log('liquidator: PLAIN_POSITION has no debt yet; nothing to prepare')
    const [usdcPrice, collPrice, usdcDec, collDec, usdcBal, collBal, allowance] = await Promise.all([
      read(a.oracle, oracleAbi, 'getAssetPrice', [a.usdc]),
      read(a.oracle, oracleAbi, 'getAssetPrice', [a.collateral]),
      read(a.usdc, erc20Abi, 'decimals'),
      read(a.collateral, erc20Abi, 'decimals'),
      read(a.usdc, erc20Abi, 'balanceOf', [me]),
      read(a.collateral, erc20Abi, 'balanceOf', [me]),
      read(a.usdc, erc20Abi, 'allowance', [me, a.pool]),
    ])
    const usdcUnit = 10n ** BigInt(usdcDec)
    const need = (debtBase * usdcUnit * 11n) / 10n / usdcPrice // whole debt in USDC, +10%
    if (usdcBal < need) {
      const borrow = need - usdcBal
      const want = (borrow * usdcPrice * 4n * 10n ** BigInt(collDec)) / (usdcUnit * collPrice) // 4x: survives a deep crash
      const supply = want < collBal ? want : collBal
      if (supply === 0n) throw new Error(`liquidator ${me} holds no collateral to borrow USDC against`)
      await send(a.collateral, erc20Abi, 'approve', [a.pool, supply])
      await send(a.pool, poolAbi, 'supply', [a.collateral, supply, me, 0])
      await send(a.pool, poolAbi, 'borrow', [a.usdc, borrow, 2n, 0, me])
      console.log(`liquidator ${me}: borrowed ${borrow} USDC units against ${supply} collateral units`)
    }
    if (allowance < need) await send(a.usdc, erc20Abi, 'approve', [a.pool, maxUint256])
    console.log(`liquidator ${me}: ready to repay ${need} USDC units of PLAIN_POSITION's debt`)
  }

  let busy = false
  async function check(block: number, debt: bigint, health: bigint) {
    if (busy || debt === 0n || health >= 10n ** 18n) return
    busy = true
    const ev = { block, bucket: a.user, health: fmtHealth(health), deadlineIn: null }
    try {
      const args = [a.collateral, a.usdc, a.user, maxUint256, false]
      const r = await mined(client, await sendTx(client, await wallet(), { address: a.pool, abi: poolAbi, functionName: 'liquidationCall', args }))
      emit({ ...ev, block: Number(r.blockNumber), decision: 'liquidated', tx: r.transactionHash })
    } catch (e) {
      emit({ ...ev, decision: 'error', error: `liquidationCall: ${errMsg(e)}` })
    } finally {
      busy = false
    }
  }

  return { prepare, check }
}
