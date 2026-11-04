import { useEffect, useRef, useState } from 'react'
import { getAddress, isAddress, type Address } from 'viem'
import { useAccount, useBalance, useBlockNumber, useConnect, useDisconnect, usePublicClient, useReadContract, useSwitchChain } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { erc20Abi } from './abi'
import { AGENT_OFF, COLLATERAL, EXPLORER, IS_FORK, IS_TESTNET, NETWORK_NAME, RPC_URL, chain } from './config'
import { useAgentPulse } from './chain'
import { explain, fmtToken, short } from './format'
import { icons } from './icons'
import { ToastProvider } from './toast'
import { Logo, ViewAsContext } from './ui'
import { Discover } from './screens/Discover'
import { Home } from './screens/Home'
import { Bucket, SampleBucket } from './screens/Bucket'
import { Crash } from './screens/Crash'
import { Landing } from './screens/Landing'

const viewTarget = (h: string) => {
  const m = /^#home-(.+)$/.exec(h)
  return m && isAddress(m[1], { strict: false }) ? getAddress(m[1]) : undefined
}

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

/** Network, chain id and latest block. Lives in the top bar header (the e2e suite reads "Local fork of Monad" and "chain 143" there). */
function NetPill() {
  const client = usePublicClient()
  const block = useBlockNumber({ watch: true })
  // One check that the RPC really serves the configured chain (a fork started with another chain id would mislead).
  const rpcChain = useQuery({ queryKey: ['rpcChainId', RPC_URL], queryFn: () => client!.getChainId(), enabled: !!client, staleTime: Infinity })
  if (rpcChain.data !== undefined && rpcChain.data !== chain.id)
    return <span className="net-pill"><i className="dot bad" />RPC is chain {rpcChain.data}, expected {chain.id}</span>
  if (block.isError)
    return <span className="net-pill" title={explain(block.error)}><i className="dot bad" />{NETWORK_NAME}: RPC not reachable</span>
  return (
    <span className="net-pill" aria-live="off">
      <i className={`dot ${block.data ? (IS_FORK ? 'warn' : 'ok') : ''}`} />
      {NETWORK_NAME} · chain {chain.id}
      <span className="mono">#{block.data ? block.data.toLocaleString('en-US') : '…'}</span>
    </span>
  )
}

const avatar = (a: string) => ({ background: `hsl(${parseInt(a.slice(2, 6), 16) % 360} 70% 62%)` })

/** Tiller's account button. Disconnected it is "Connect wallet"; connected its accessible name is the short address. */
function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const weth = useReadContract({ address: COLLATERAL!, abi: erc20Abi, functionName: 'balanceOf', args: [address!], query: { enabled: !!(address && COLLATERAL), refetchInterval: 5000 } })
  const mon = useBalance({ address, query: { enabled: !!address, refetchInterval: 10_000 } })
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])
  if (isConnected && address)
    return (
      <div className="wallet" ref={box}>
        <button className="acct-btn" type="button" title={address} aria-expanded={open} onClick={() => setOpen(!open)}>
          <i className="avatar" style={avatar(address)} />
          <span>{short(address)}</span>
          {weth.data !== undefined && <small aria-hidden="true">{fmtToken(weth.data, 18)} WETH</small>}
        </button>
        {open && (
          <div className="acct-menu">
            <div className="acct-bal">
              <span>Wallet</span>
              <strong>{weth.data !== undefined ? `${fmtToken(weth.data, 18)} WETH` : '…'}</strong>
              <small>{mon.data ? `${fmtToken(mon.data.value, 18)} MON for gas` : ''}</small>
            </div>
            <button type="button" onClick={() => navigator.clipboard?.writeText(address).catch(() => {})}>{icons.copy}Copy address</button>
            {!IS_FORK && <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">{icons.external}View on explorer</a>}
            <button type="button" onClick={() => { setOpen(false); disconnect() }}>{icons.logout}Disconnect</button>
          </div>
        )}
      </div>
    )
  const noWallet = (error as Error | null)?.name === 'ProviderNotFoundError'
  return (
    <div className="wallet">
      <button className="abtn" type="button" disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>
        {isPending ? 'Check your wallet' : 'Connect wallet'}
      </button>
      {error && <span className="reason" role="alert">{noWallet ? 'No browser wallet found.' : explain(error)}</span>}
    </div>
  )
}

function WrongNetwork() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending, error } = useSwitchChain()
  if (!isConnected || chainId === chain.id) return null
  return (
    <div className="banner warn" role="alert">
      <span>Your wallet is on another network{chainId ? ` (chain ${chainId})` : ''}. Open Bucket runs on Monad, chain {chain.id}.</span>
      <span className="btn-row">
        {error && <span>{explain(error)}</span>}
        <button className="abtn small" type="button" disabled={isPending} onClick={() => switchChain({ chainId: chain.id })}>
          {isPending ? 'Check your wallet' : 'Switch to Monad'}
        </button>
      </span>
    </div>
  )
}

/** Sidebar network card: where reads come from, the latest block and whether the agent is watching. */
function NetCard() {
  const block = useBlockNumber({ watch: true })
  const pulse = useAgentPulse()
  return (
    <div className="net-card">
      <div className="net-row"><strong>{NETWORK_NAME}</strong><i className={`dot ${block.data ? 'ok' : block.isError ? 'bad' : ''}`} /></div>
      <span>Block <span className="mono">{block.data ? block.data.toLocaleString('en-US') : '…'}</span></span>
      <span>{pulse.status === 'live' ? `Agent watching${pulse.lastBlock ? `, block ${pulse.lastBlock.toLocaleString('en-US')}` : ''}` : pulse.status === 'offline' ? (AGENT_OFF ? 'Agent runs on our demo machine' : 'Agent offline') : 'Agent connecting'}</span>
    </div>
  )
}

/** In-page anchors of the landing page; they must not switch to an app screen. */
const LANDING = ['', '#', '#welcome', '#why', '#how', '#safety', '#proof', '#compare', '#roadmap']

const TITLES = { discover: 'Discover', home: 'My money', bucket: 'Bucket', crash: 'Crash demo', sample: 'Sample data' } as const

export default function App() {
  return <ToastProvider><Shell /></ToastProvider>
}

function Shell() {
  const hash = useHash()
  const main = useRef<HTMLElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (LANDING.includes(hash)) return // let the browser scroll to the landing anchor
    main.current?.focus() // move focus to the new screen for keyboard and screen reader users
    window.scrollTo(0, 0)
  }, [hash])

  // #home-<address> starts a read-only view of that wallet; it lasts across screens until #home ("Stop viewing").
  const [viewAs, setViewAs] = useState<Address | undefined>(() => viewTarget(window.location.hash))
  const target = viewTarget(hash)
  if (target && target !== viewAs) setViewAs(target)
  if (hash === '#home' && viewAs) setViewAs(undefined)
  const homeMatch = /^#home-(.+)$/.exec(hash)
  const bucketMatch = /^#bucket-(.+)$/.exec(hash)
  const landing = LANDING.includes(hash)
  const screen = hash === '#crash' ? 'crash' : bucketMatch ? 'bucket' : hash === '#sample' ? 'sample' : hash === '#home' || homeMatch ? 'home' : 'discover' // #routes still lands on Discover
  const bucketAddr = bucketMatch?.[1]
  useEffect(() => { document.title = landing ? 'Open Bucket' : `${TITLES[screen]} · Open Bucket` }, [landing, screen])

  const nav = [
    { href: '#discover', name: 'Discover', icon: icons.discover, on: screen === 'discover' },
    { href: viewAs ? `#home-${viewAs}` : '#home', name: 'My money', icon: icons.money, on: screen === 'home' },
    ...(IS_FORK ? [{ href: '#crash', name: 'Crash demo', icon: icons.crash, on: screen === 'crash' }] : []),
  ]
  const banners = (
    <>
      {IS_FORK && <div className="banner warn" role="note">Fork of Monad mainnet. Prices on this screen are changed by us for the demo.</div>}
      {IS_TESTNET && <div className="banner info" role="note">Monad testnet. Lending runs on the Open Bucket test pool because Aave isn't deployed on Monad testnet.</div>}
    </>
  )

  if (landing) return <>{banners}<Landing /></>

  return (
    <div className="shell">
      <aside className="side">
        <a className="logo" href="#welcome"><Logo /><span>Open Bucket</span></a>
        <span className="side-tag">Exit rules for your DeFi loan</span>
        <nav aria-label="App">
          {nav.map((n) => <a key={n.name} href={n.href} className={n.on ? 'active' : ''} aria-current={n.on ? 'page' : undefined}>{n.icon}<span>{n.name}</span></a>)}
        </nav>
        <div className="side-foot">
          <NetCard />
          <a href="#welcome" className="side-link">About Open Bucket</a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="crumb">Open Bucket</span>
            <h1>{TITLES[screen]}</h1>
          </div>
          <div className="topbar-right">
            <NetPill />
            <WalletButton />
          </div>
        </header>
        {banners}
        {screen === 'sample' && <div className="banner sample" role="note">Sample data. Nothing on this page is real.</div>}
        {viewAs && <div className="banner info" role="note"><span>Viewing {short(viewAs)}, read only.</span><a href="#home">Stop viewing</a></div>}
        <WrongNetwork />

        <ViewAsContext.Provider value={viewAs}>
          <main className="page" ref={main} tabIndex={-1} key={screen}>
            {screen === 'crash' && <Crash />}
            {screen === 'sample' && <SampleBucket />}
            {screen === 'bucket' && (bucketAddr && isAddress(bucketAddr, { strict: false })
              ? <Bucket address={bucketAddr as Address} key={bucketAddr.toLowerCase()} />
              : <div className="notice bad" role="alert">That link does not contain a valid bucket address. <a href="#discover">Back to Discover</a></div>)}
            {screen === 'discover' && <Discover />}
            {screen === 'home' && (homeMatch && !target
              ? <div className="notice bad" role="alert">That link does not contain a valid wallet address. <a href="#home">Back to My money</a></div>
              : <Home />)}
            <p className="hint">Every number comes from a contract read on {NETWORK_NAME} or from a named API. Reads from <span className="mono">{RPC_URL}</span>.</p>
          </main>
        </ViewAsContext.Provider>
      </div>

      <nav className="tabbar" aria-label="App" style={{ ['--tabs' as string]: nav.length }}>
        {nav.map((n) => <a key={n.name} href={n.href} className={n.on ? 'active' : ''}>{n.icon}<span>{n.name}</span></a>)}
      </nav>
    </div>
  )
}
