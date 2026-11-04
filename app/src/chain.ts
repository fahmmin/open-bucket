// Event history without an indexer. Public Monad RPCs cap eth_getLogs at 100 blocks (checked on mainnet and
// testnet), so instead of scanning, binary-search the block where the bucket got code (its createAndOpen tx emits
// Opened) and the block where closed() flipped (its exit tx emits Exited), then read logs for just those blocks.
import { useEffect, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { bucketAbi } from './abi'
import { AGENT_SSE, IS_FORK } from './config'

/** How far back to search. rpc.monad.xyz keeps state about 1M blocks back (docs/onchain-facts.md section 5). */
const WINDOW = 900_000n
export const bucketEvents = bucketAbi.filter((x) => x.type === 'event')

/** First block in (lo, hi] where `test` is true, given test(hi) is true. Errors (pruned state) count as false. */
async function firstTrue(lo: bigint, hi: bigint, test: (b: bigint) => Promise<boolean>) {
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n
    if (await test(mid).catch(() => false)) hi = mid
    else lo = mid
  }
  return hi
}

/** First block mined on the fork (anvil). Older blocks live upstream, where getLogs is capped at 100 blocks. */
export async function forkStart(client: PublicClient) {
  try {
    const info = (await (client.request as (a: { method: string }) => Promise<{ forkConfig?: { forkBlockNumber?: number | string } }>)({ method: 'anvil_nodeInfo' }))
    const n = info?.forkConfig?.forkBlockNumber
    if (n !== undefined && n !== null) return BigInt(n) + 1n
  } catch { /* not anvil: fall back below */ }
  const latest = await client.getBlockNumber()
  return latest > 99n ? latest - 99n : 0n
}

export async function loadHistory(client: PublicClient, bucket: Address, closed: boolean) {
  if (IS_FORK) {
    // On the local fork every bucket was made after the fork block and anvil has no log range cap, so read them all.
    const logs = await client.getLogs({ address: bucket, events: bucketEvents, fromBlock: await forkStart(client), toBlock: 'latest' })
    const times = new Map<bigint, bigint>()
    await Promise.all([...new Set(logs.map((l) => l.blockNumber!))].map(async (b) => times.set(b, (await client.getBlock({ blockNumber: b })).timestamp)))
    return { logs: logs.map((l) => ({ ...l, timestamp: times.get(l.blockNumber!) })).reverse(), note: undefined as string | undefined }
  }
  const latest = await client.getBlockNumber()
  const lo = latest > WINDOW ? latest - WINDOW : 0n
  const hasCode = async (b: bigint) => !!(await client.getCode({ address: bucket, blockNumber: b }))
  const blocks: bigint[] = []
  let note: string | undefined
  if (await hasCode(lo).catch(() => false)) note = `This bucket is older than ${WINDOW.toLocaleString('en-US')} blocks, so its opening is not shown.`
  else blocks.push(await firstTrue(lo, latest, hasCode))
  if (closed) {
    const isClosed = (b: bigint) => client.readContract({ address: bucket, abi: bucketAbi, functionName: 'closed', blockNumber: b })
    blocks.push(await firstTrue(blocks[0] ?? lo, latest, isClosed))
  }
  const logs = (await Promise.all(blocks.map((b) => client.getLogs({ address: bucket, events: bucketEvents, fromBlock: b, toBlock: b })))).flat()
  const times = new Map<bigint, bigint>()
  await Promise.all(blocks.map(async (b) => times.set(b, (await client.getBlock({ blockNumber: b })).timestamp)))
  return { logs: logs.map((l) => ({ ...l, timestamp: times.get(l.blockNumber!) })).reverse(), note }
}

export type AgentLine = {
  t?: number; block?: number | string; bucket?: string; health?: number | string | null
  deadlineIn?: number | null; decision?: string; reason?: string; tx?: string; error?: string
}

/** Agent SSE stream (build-spec section 5), filtered to one bucket, newest first. */
export function useAgentLog(bucket: string | undefined, max = 8) {
  const [lines, setLines] = useState<AgentLine[]>([])
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  useEffect(() => {
    if (!bucket) return
    const want = bucket.toLowerCase()
    let es: EventSource
    try {
      es = new EventSource(AGENT_SSE)
    } catch {
      setStatus('offline')
      return
    }
    es.onopen = () => setStatus('live')
    es.onerror = () => { if (es.readyState !== EventSource.OPEN) setStatus('offline') } // EventSource retries on its own
    es.onmessage = (e) => {
      let line: AgentLine
      try { line = JSON.parse(e.data) } catch { return }
      if (typeof line.bucket !== 'string' || line.bucket.toLowerCase() !== want) return
      setStatus('live')
      setLines((prev) => [line, ...prev].slice(0, max))
    }
    return () => es.close()
  }, [bucket, max])
  return { lines, status }
}

/** Agent heartbeat for My money: last block checked, buckets in it, blocks checked since this page opened. */
export function useAgentPulse() {
  const [state, setState] = useState<{ status: 'connecting' | 'live' | 'offline'; lastBlock?: number; watching: number; blocksSinceOpen: number }>({ status: 'connecting', watching: 0, blocksSinceOpen: 0 })
  useEffect(() => {
    const openedAt = Date.now()
    const seen = new Set<number>() // blocks checked after this page opened (the stream replays older lines first)
    const inBlock = new Map<number, Set<string>>()
    let es: EventSource
    try {
      es = new EventSource(AGENT_SSE)
    } catch {
      setState((s) => ({ ...s, status: 'offline' }))
      return
    }
    es.onopen = () => setState((s) => ({ ...s, status: 'live' }))
    es.onerror = () => { if (es.readyState !== EventSource.OPEN) setState((s) => ({ ...s, status: 'offline' })) }
    es.onmessage = (e) => {
      let l: AgentLine
      try { l = JSON.parse(e.data) } catch { return }
      const block = Number(l.block)
      if (!Number.isFinite(block) || typeof l.bucket !== 'string' || l.decision === 'liquidated') return
      if (!inBlock.has(block)) inBlock.set(block, new Set())
      inBlock.get(block)!.add(l.bucket.toLowerCase())
      if (inBlock.size > 20) inBlock.delete(Math.min(...inBlock.keys()))
      if (typeof l.t !== 'number' || l.t >= openedAt) seen.add(block)
      const last = Math.max(...inBlock.keys())
      setState({ status: 'live', lastBlock: last, watching: inBlock.get(last)!.size, blocksSinceOpen: seen.size })
    }
    return () => es.close()
  }, [])
  return state
}

/** Wall clock in seconds, ticking once a second (for deadline countdowns). */
export function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
