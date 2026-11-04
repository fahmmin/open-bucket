import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import type { Address, Hash } from 'viem'
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { EXPLORER, IS_FORK, RULER_MAX, RULER_MIN } from './config'
import { explain, fmtHf, hfNumber, short } from './format'
import { useToast } from './toast'

/** The Open Bucket mark: a bucket with its handle, the lower half filled. */
export const Logo = () => (
  <svg viewBox="0 0 52 52" aria-hidden="true">
    <path d="M14 13 C14 4, 38 4, 38 13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M9 16 H43 L38.5 45 H13.5 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    <path d="M12.2 29 H39.8" stroke="currentColor" strokeWidth="3" />
    <path d="M13.5 45 L12.2 29 H39.8 L38.5 45 Z" fill="currentColor" opacity=".22" />
  </svg>
)

/** Read-only view of another wallet (#home-<address>). While set, screens hide every write action. */
export const ViewAsContext = createContext<Address | undefined>(undefined)
export const useViewAs = () => useContext(ViewAsContext)

export function Addr({ a, label }: { a: Address | undefined; label?: string }) {
  if (!a) return <span className="muted">not set</span>
  return (
    <a href={`${EXPLORER}/address/${a}`} target="_blank" rel="noreferrer" title={a}>
      {label ?? <span className="mono">{short(a)}</span>}
    </a>
  )
}

/** Fork-only transactions do not exist on the public explorer, so on the fork the hash is shown without a link. */
export function TxLink({ hash }: { hash: Hash }) {
  if (IS_FORK) return <span className="mono" title={hash}>{short(hash, 10, 6)} (fork only)</span>
  return (
    <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer" title={hash} className="mono">
      {short(hash, 10, 6)}
    </a>
  )
}

export const Chip = ({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'acc' | 'plain'; children: ReactNode }) => (
  <span className={`chip ${tone}`}>{children}</span>
)

/** Tiller stat card: label, big value with an optional unit, one line under it; a skeleton while loading. */
export function Stat({ label, value, unit, sub }: { label: string; value?: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      {value === undefined ? <span className="skel" style={{ width: '60%', height: 30 }} /> : <strong className="stat-value">{value}{unit && <small>{unit}</small>}</strong>}
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

export const Notice = ({ tone, children }: { tone?: 'bad' | 'warn' | 'ok'; children: ReactNode }) => (
  <div className={`notice ${tone ?? ''}`} role={tone === 'bad' ? 'alert' : undefined}>{children}</div>
)

export const healthTone = (hf: number | undefined) => (hf === undefined ? 'ok' : hf < 1 ? 'bad' : hf < 1.25 ? 'warn' : 'ok')
const pos = (hf: number) => Math.max(0, Math.min(1, (hf - RULER_MIN) / (RULER_MAX - RULER_MIN))) * 100

/** The plan's health ruler: 0.90 to 1.60, liquidation mark at 1.00 and the owner's exit line. */
export function HealthRuler({ hf, floor, floorLabel = 'your exit line' }: { hf: bigint | undefined; floor?: bigint; floorLabel?: string }) {
  const n = hfNumber(hf)
  const f = floor ? hfNumber(floor) : undefined
  const noDebt = hf !== undefined && n === undefined
  const label = hf === undefined ? 'Health factor not loaded'
    : noDebt ? 'No debt, health factor is unlimited'
    : `Health factor ${fmtHf(hf)}. Liquidation at 1.00${f ? `, exit line at ${fmtHf(floor)}` : ''}.`
  return (
    <div className="ruler" role="img" aria-label={label}>
      <div className="track" />
      <div className="mark" style={{ left: `${pos(1)}%` }} />
      <span className="mark-l" style={{ left: `${pos(1)}%` }}>1.00 liquidation</span>
      {f !== undefined && (
        <>
          <div className="mark exit" style={{ left: `${pos(f)}%` }} />
          <span className={`mark-l exit ${pos(f) > 85 ? 'edge-r' : ''}`} style={{ left: `${pos(f)}%` }}>{fmtHf(floor)} {floorLabel}</span>
        </>
      )}
      {n !== undefined && (
        <>
          <div className={`needle ${healthTone(n)}`} style={{ left: `${pos(n)}%` }} />
          <span className="hf-read" style={{ left: `${pos(n)}%` }}>{fmtHf(hf)}</span>
        </>
      )}
    </div>
  )
}

/** One write flow: wallet prompt, then the receipt. */
export function useTx() {
  const w = useWriteContract()
  const r = useWaitForTransactionReceipt({ hash: w.data })
  return { ...w, receipt: r.data, waiting: !!w.data && r.isLoading, receiptError: r.error }
}

/** Button text while a tx is in flight. These exact strings are used by the Synpress E2E tests. */
export const txLabel = (tx: ReturnType<typeof useTx>, idle: string) =>
  tx.isPending ? 'Confirm in your wallet' : tx.waiting ? 'Waiting for confirmation' : idle

/** Result of a write. Pending states live on the button (see txLabel); errors use role="alert". */
export function TxStatus({ tx, done }: { tx: ReturnType<typeof useTx>; done?: ReactNode }) {
  // Progress goes to a Tiller toast (worded so it never repeats the button's own text); errors stay inline as role="alert".
  const toast = useToast()
  const id = useRef<number | undefined>(undefined)
  const stage = tx.isPending ? 'wallet' : tx.error ? 'error' : !tx.data ? 'idle' : tx.receiptError ? 'error' : !tx.receipt ? 'sent' : tx.receipt.status === 'success' ? 'done' : 'error'
  useEffect(() => {
    if (stage === 'wallet') id.current = toast({ kind: 'pending', title: 'Waiting for your wallet', body: 'Check the request in your wallet.' }, id.current)
    else if (stage === 'sent') id.current = toast({ kind: 'pending', title: 'Sent to Monad', body: 'Waiting for the block.', tx: tx.data }, id.current)
    else if (stage === 'done') { toast({ kind: 'success', title: 'Confirmed', body: `Block ${tx.receipt!.blockNumber.toLocaleString('en-US')}`, tx: tx.data }, id.current); id.current = undefined }
    else if (id.current !== undefined) { toast(null, id.current); id.current = undefined } // the error shows inline
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps
  if (tx.isPending) return null
  if (tx.error) return <Notice tone="bad">{explain(tx.error)}</Notice>
  if (!tx.data) return null
  if (tx.receiptError) return <Notice tone="bad">Sent, but the receipt could not be read: {explain(tx.receiptError)} <TxLink hash={tx.data} /></Notice>
  if (!tx.receipt) return null
  if (tx.receipt.status !== 'success') return <Notice tone="bad">The transaction failed in block {tx.receipt.blockNumber.toLocaleString('en-US')}. <TxLink hash={tx.data} /></Notice>
  return done ? <p>{done}</p> : null
}
