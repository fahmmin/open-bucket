// Landing page: a port of the Tiller Finance landing (same sections, spacing, per-word hero and motion) with
// Open Bucket content and the Monad palette. Live figures come from the same reads as the app; static facts name their source.
import { Fragment, useState } from 'react'
import { LENDER, NETWORK_NAME, ORACLE_NAME } from '../config'
import { useAgentPulse } from '../chain'
import { fmtPct, fmtPrice8 } from '../format'
import { useMarket, useVaultBoard } from '../market'
import { Logo } from '../ui'
import { sortRoutes } from './Discover'
import '../landing.css'

const TESTNET_EXIT_TX = '0x8691f3ca6257d62e8234a70db48082d72650163423167eb95f95dfb4b1d2cd82'

const PARTS = [
  { name: 'The bucket', body: 'A small contract that only you own. It holds your Aave loan and your vault deposit together, so one exit can close both.', stat: '1', statLabel: 'contract holds the loan and the deposit' },
  { name: 'Discover', body: 'Compares every USDC vault we know on Monad after the borrow cost. Each route shows how fast you can get out and who runs it, before you sign.', stat: '10', statLabel: 'Monad vaults compared, live' },
  { name: 'Exit rules', body: 'You pick a health line and, if you like, a deadline. When one is true, anyone can trigger the exit, and the money still only goes to you.', stat: '2', statLabel: 'rules: a health line and a deadline' },
  { name: 'The agent', body: 'An open-source program checks every bucket on every Monad block. It can only call exit, and it earns a tip of at most 0.5% for doing it.', stat: '0.5%', statLabel: 'the most it can ever be paid, set in the contract' },
]

const STEPS = [
  { name: 'Pick a route', body: 'Discover lists every vault after the borrow cost, with how fast it lets you out.' },
  { name: 'Set your exit rules', body: 'A health line and an optional deadline, stored in your bucket.' },
  { name: 'The agent watches', body: 'Every block it reads your rules from the contract and exits the moment one is true.' },
]

const COMPARE: [string, string, string, string, string, string][] = [
  ['DeFi Saver', 'No', 'No, the loan only', '—', 'No, allowlisted bots', 'Automation bots for loans (stop-loss, repay), not on Monad'],
  ['Summer.fi', 'No', 'No, the loan side only', '—', '—', 'Stop-loss and trailing stop on loans, not on Monad'],
  ['Instadapp', 'No', '—', '—', '—', 'Smart accounts for DeFi, not on Monad'],
  ['Gearbox', 'Yes, $0.25M', '—', 'No', '—', 'Debt must come from Gearbox’s own pools'],
  ['Curvance', 'Yes', 'No', 'Curvance loans only', '—', 'leverageFor / deleverageFor work inside Curvance only'],
  ['Morpho', 'Yes', 'No', 'Morpho loans only', '—', 'Pre-liquidation and Bundler3: Morpho markets only, one transaction at a time'],
  ['Euler', 'Yes', 'No', 'Euler loans only', '—', 'EVC operators work with Euler vaults only'],
  ['Aave', 'Yes, V3', 'No', '—', '—', 'Credit delegation on V3; V4 Position Managers are governance-gated and not on Monad'],
  ['Enso / LI.FI', 'Yes', 'No', '—', '—', 'One-transaction zaps; nothing watches the position afterwards'],
  ['Gelato / FastLane', 'Gelato testnet only; FastLane unknown', '—', '—', '—', 'Keeper infrastructure, not a product'],
  ['DefiLlama Yields', 'Lists Monad yields', 'No', 'No', 'No', 'Yield lists: doesn’t open, net the borrow cost or protect'],
  ['Open Bucket', 'Testnet now, capped mainnet next', 'Yes', 'No, opens a new loan in your bucket', 'Yes, while your rule is true', 'Aave and allowlisted vaults only; no swaps yet'],
]
const COMPARE_COLS = ['On Monad', 'Watches loan and yield together', 'Works with the loan you already have', 'Anyone can trigger the exit', 'Limit']

const HERO_WORDS = ['What', 'if', 'your', 'loan', '{chip}', 'paid', 'itself', 'back', '{br}', 'before', 'you', 'lost', 'your', 'ETH?']

export function Landing() {
  const { market: mk } = useMarket()
  const board = useVaultBoard(mk)
  const best = sortRoutes(board.rows, 'yield')[0]
  const pulse = useAgentPulse()
  const [open, setOpen] = useState(0)
  const nets = board.rows.map((r) => r.net).filter((n): n is number => n !== undefined)
  const maxNet = Math.max(0.01, ...nets.map((n) => Math.abs(n)))
  let word = 0

  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-logo" href="#welcome"><Logo /><span>Open Bucket</span></a>
        <nav aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#safety">Why it’s safer</a>
          <a href="#proof">Proof</a>
          <a href="#compare">Compare</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <Cta href="#discover">Open app</Cta>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-badges">
          <span className="lp-tag"><i />Built on Monad<i /></span>
          <span className="lp-tag"><i />Exit rules for your DeFi loan<i /></span>
        </div>
        <h1 className="lp-hero-title">
          {HERO_WORDS.map((w, i) => w === '{br}' ? <br key={i} className="br-desk" />
            : w === '{chip}' ? <Fragment key={i}><span className="lp-chip w" aria-hidden="true" style={{ animationDelay: `${word++ * 0.05}s` }}><BucketChip /></span>{' '}</Fragment>
            : <Fragment key={i}><span className="w" style={{ animationDelay: `${word++ * 0.05}s` }}>{w}</span>{' '}</Fragment>)}
        </h1>
        <p className="lp-hero-sub">
          Open Bucket keeps <mark className="hl white">your Aave loan</mark> and <mark className="hl pink">your vault deposit</mark> in one contract with{' '}
          <mark className="hl purple">your exit rules</mark>. An agent watches every Monad block and exits for you. <mark className="hl black">It can only ever pay you.</mark>
        </p>
        <div className="lp-hero-ctas">
          <Cta href="#discover">Open app</Cta>
          <Cta href="#crash" ghost>Watch the crash</Cta>
        </div>
      </section>

      <section className="lp-dark lp-pov" id="why">
        <span className="lp-tag dark"><i />Why this exists<i /></span>
        <p className="lp-statement">
          Lending is most of Monad DeFi, and <span className="accent-text">nobody watches both sides of your position</span>.
        </p>
        <div className="lp-pov-foot">
          <div className="lp-pov-badges" aria-hidden="true"><i>Ξ</i><i>$</i><i>%</i><i>✓</i></div>
          <p>About $788M of Monad’s $912M DeFi TVL is lending (DefiLlama, 3 Nov 2026). The loan sits in one protocol and the USDC that could repay it sits in another, so when the price drops, Aave only sees the loan.</p>
        </div>

        <div className="lp-parts" id="how">
          <div>
            <span className="lp-tag dark"><i />Four parts, one bucket<i /></span>
            <h2>What keeps your loan safe?</h2>
            <ol>
              {PARTS.map((p, i) => (
                <li key={p.name}>
                  <button type="button" className={open === i ? 'open' : ''} onClick={() => setOpen(i)} aria-expanded={open === i}>
                    <span className="lp-idx">{String(i + 1).padStart(2, '0')}</span>
                    {p.name}
                  </button>
                  {open === i && <p>{p.body}</p>}
                </li>
              ))}
            </ol>
          </div>
          <div className="lp-parts-panel">
            <PartFigure index={open} />
            <span className="lp-panel-kicker">{PARTS[open].name}</span>
            <strong>{PARTS[open].stat}</strong>
            <span>{PARTS[open].statLabel}</span>
          </div>
        </div>
      </section>

      <section className="lp-dark lp-versus" id="safety">
        <span className="lp-tag dark"><i />Why use a bucket<i /></span>
        <h2>Same loan. Different ending.</h2>
        <div className="lp-vs">
          <div className="lp-vs-head muted-head">Plain Aave position</div>
          <span className="lp-vs-mid">VS</span>
          <div className="lp-vs-head purple-head"><Logo /><span>Open Bucket</span></div>
          <ul className="lp-vs-list no">
            <li>Nobody watches it while you sleep</li>
            <li>A liquidator takes a bonus when health falls below 1.00</li>
            <li>The USDC in your vault can’t repay the loan</li>
            <li>You find out afterwards</li>
          </ul>
          <ul className="lp-vs-list yes">
            <li>The agent checks it every block</li>
            <li>It exits at your health line, before liquidation</li>
            <li>Vault USDC repays the whole loan in the same transaction</li>
            <li>Your WETH comes back to you, minus a capped tip</li>
          </ul>
        </div>
        <div className="lp-figures-row">
          <figure>
            <div className="lp-outcome" role="img" aria-label="Plain Aave position lost 0.042 WETH to the liquidation bonus">
              <span>Lost to the liquidation bonus</span>
              <div className="lp-outcome-track"><i className="bad" style={{ width: '100%' }} /></div>
              <strong>0.042 WETH</strong>
            </div>
            <figcaption>Plain Aave position, liquidated on our fork run.</figcaption>
          </figure>
          <figure>
            <div className="lp-outcome" role="img" aria-label="Bucket paid a 0.002 WETH tip and returned 1.998 WETH">
              <span>Tip paid to the agent</span>
              <div className="lp-outcome-track"><i className="good" style={{ width: `${(0.002 / 0.042) * 100}%` }} /></div>
              <strong>0.002 WETH</strong>
            </div>
            <figcaption>Same position in a bucket: 1.998 WETH back, loan fully repaid.</figcaption>
          </figure>
        </div>
        <p className="lp-fine light">From our crash demo on a local fork of Monad mainnet: the same 2 WETH position twice, the same price drops.</p>
      </section>

      <section className="lp-cards" aria-label="Live rates and the agent">
        <article className="lp-card light">
          <div className="lp-card-head">
            <h2>Rates right now</h2>
            <span className="lp-live-dot">{NETWORK_NAME}</span>
          </div>
          <div className="lp-rates">
            <div><span>WETH price</span><strong>{mk ? fmtPrice8(mk.collateralPrice) : '…'}</strong><small>{ORACLE_NAME}</small></div>
            <div><span>USDC borrow cost</span><strong>{mk ? fmtPct(mk.borrowApr) : '…'}</strong><small>{LENDER}, a year</small></div>
            <div><span>Best route, net</span><strong>{best?.net !== undefined ? fmtPct(best.net) : '…'}</strong><small>{best ? best.name : 'loading'}</small></div>
          </div>
          <div className="lp-bars" role="img" aria-label="Net yield of each vault after the borrow cost">
            {board.rows.map((r) => <i key={r.address} title={`${r.name}: ${r.net !== undefined ? fmtPct(r.net) : 'no figure'}`}
              className={r.net === undefined ? 'none' : r.net < 0 ? 'neg' : r.address === best?.address ? 'hot' : ''}
              style={{ height: `${r.net === undefined ? 6 : Math.max(6, (Math.abs(r.net) / maxNet) * 100)}%` }} />)}
          </div>
          <p className="lp-small muted">Each bar is one Monad USDC vault, net of the borrow cost. Prices from {ORACLE_NAME}, rates from {LENDER}, vault yields from DefiLlama through our agent.</p>
        </article>
        <article className="lp-card dark lp-stat-card">
          <div className="lp-dots" aria-hidden="true">
            {Array.from({ length: 21 }, (_, i) => <i key={i} className={i < Math.min(21, pulse.blocksSinceOpen) ? 'on' : ''} />)}
          </div>
          <div className="lp-stat-row">
            <strong className="lp-big">{pulse.status === 'offline' ? 'Offline' : pulse.blocksSinceOpen.toLocaleString('en-US')}</strong>
            <span>{pulse.status === 'offline' ? 'Agent offline: exits still work, anyone can trigger them' : 'blocks checked by the agent since you opened this page'}</span>
          </div>
          <hr />
          <p className="lp-stat-claim">An agent that watches both sides of your loan, every block.</p>
          <div className="lp-stat-row small-row">
            <span>Last block checked</span>
            <strong className="pink-text">{pulse.lastBlock ? `#${pulse.lastBlock.toLocaleString('en-US')}` : '…'}</strong>
          </div>
        </article>
      </section>

      <section className="lp-strip" aria-label="Built with">
        <p>Built with</p>
        <ul>
          <li className="wm-1">Monad</li>
          <li className="wm-2">Aave V3</li>
          <li className="wm-3">Morpho</li>
          <li className="wm-4">Chainlink</li>
          <li className="wm-5">Foundry</li>
          <li className="wm-6">viem</li>
        </ul>
      </section>

      <section className="lp-proof" id="proof">
        <div className="lp-section-head center">
          <h2>Tested on chain, not on slides.</h2>
          <p>Facts from our build on 4 Nov 2026, each with its source.</p>
        </div>
        <div className="lp-bento">
          <a className="lp-card cyan" href={`https://testnet.monadvision.com/tx/${TESTNET_EXIT_TX}`} target="_blank" rel="noreferrer">
            <span className="lp-badge">Exit on Monad testnet</span>
            <strong className="lp-big">1.3 s</strong>
            <p>From the moment a rule turned true to the confirmed exit. Transaction <span className="mono">{TESTNET_EXIT_TX.slice(0, 10)}…{TESTNET_EXIT_TX.slice(-6)}</span>.</p>
          </a>
          <div className="lp-card grey">
            <span className="lp-badge light">Contract tests</span>
            <strong className="lp-big">19</strong>
            <div className="lp-squares" aria-hidden="true">{Array.from({ length: 19 }, (_, i) => <i key={i} className={i < 4 ? 'hot' : ''} />)}</div>
            <p>Foundry tests passing. The 4 highlighted run against real Aave on a fork of Monad mainnet.</p>
          </div>
          <div className="lp-card dark wide">
            <div className="lp-wide-text">
              <span className="muted-light">Source code, verified</span>
              <strong className="lp-big accent-text">6 contracts</strong>
              <p>Verified on Sourcify, so anyone can read the code that holds the money.</p>
              <Cta href="https://sourcify.dev" light>Open Sourcify</Cta>
            </div>
            <div className="lp-wide-quote">
              <p>“Same crash. The plain position lost 0.042 WETH to the liquidation bonus. The bucket paid a 0.002 WETH tip and returned 1.998 WETH.”</p>
              <span>The verdict our crash demo printed on a fork of Monad mainnet</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-numbers" aria-label="Key numbers">
        <span className="lp-tag"><i />The numbers behind it<i /></span>
        <div className="lp-numbers-row">
          <div><strong>$788<sup>M</sup></strong><span>Lending TVL on Monad (DefiLlama, 3 Nov 2026)</span></div>
          <div><strong>0</strong><span>Position automation tools live on Monad mainnet (our check, 3 Nov 2026)</span></div>
          <div><strong>1<sup>block</sup></strong><span>From a rule turning true to the exit</span></div>
          <div><strong>0.5<sup>%</sup></strong><span>Most the agent can ever be tipped</span></div>
        </div>
      </section>

      <section className="lp-loop">
        <div className="lp-card grey lp-loop-left">
          <div className="lp-loop-head">
            <h2>How a bucket works.</h2>
            <p>The same loop for every bucket, every block.</p>
          </div>
          <FigAgent />
          <div className="lp-loop-foot">
            <strong>3</strong>
            <span>steps, and you only do the first two.</span>
          </div>
        </div>
        <div className="lp-loop-right">
          <span className="lp-loop-kicker">3 steps</span>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.name}>
                <span className="lp-idx purple">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.name}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-compare" id="compare">
        <div className="lp-section-head">
          <h2>Who does what today</h2>
          <p>Tools a Monad borrower could reach for, from our research report. A dash means the report does not say.</p>
        </div>
        <div className="lp-table-wrap">
          <table className="lp-table">
            <thead><tr><th scope="col">Tool</th>{COMPARE_COLS.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>
              {COMPARE.map(([name, ...cells]) => (
                <tr key={name} className={name === 'Open Bucket' ? 'us' : ''}>
                  <th scope="row">{name}</th>
                  {cells.map((c, i) => <td key={i} data-label={COMPARE_COLS[i]}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lp-compare-note">Every lender built its own permission system, and none of them spans two protocols. A loan on Aave with yield on Morpho has nobody watching both.</p>
      </section>

      <section className="lp-roadmap" id="roadmap">
        <div className="lp-section-head center">
          <span className="lp-tag"><i />After the hackathon<i /></span>
          <h2>Where Open Bucket goes next.</h2>
        </div>
        <ol className="lp-road">
          <li><span className="lp-idx">01</span><h3>Flash-loan exits</h3><p>Repay with an Aave flash loan so an exit never waits on the vault. Flash loans are on for Aave Monad, at 5 bps.</p></li>
          <li><span className="lp-idx">02</span><h3>More lenders</h3><p>Euler, Morpho and Curvance next to Aave, so the loan you already have can live in a bucket.</p></li>
          <li><span className="lp-idx">03</span><h3>Capped mainnet launch</h3><p>The factory on Monad mainnet with a cap on every bucket while the code earns trust.</p></li>
          <li><span className="lp-idx">04</span><h3>A second keeper</h3><p>FastLane’s Task Manager as another way to trigger exits, so our agent is never the only one.</p></li>
        </ol>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div>
            <p className="lp-footer-lead">Your loan, with an exit plan.</p>
            <div className="lp-footer-ctas"><Cta href="#discover" light>Open app</Cta></div>
          </div>
          <nav aria-label="Footer">
            <a href="#discover">Discover</a>
            <a href="#home">My money</a>
            <a href="#crash">Crash demo</a>
            <a href="https://monad.xyz" target="_blank" rel="noreferrer">Monad</a>
          </nav>
        </div>
        <p className="lp-footer-mark" aria-hidden="true">Open Bucket</p>
        <p className="lp-disclaimer">Open Bucket is hackathon software built at Monad Blitz Mumbai. The contracts are unaudited. Crash figures come from a local fork of Monad mainnet where we change the prices. Monad, Aave, Morpho and Chainlink are their owners’ names.</p>
      </footer>
    </div>
  )
}

function Cta({ href, children, ghost = false, light = false }: { href: string; children: string; ghost?: boolean; light?: boolean }) {
  const external = href.startsWith('http')
  return (
    <a className={`lp-cta${ghost ? ' ghost' : ''}${light ? ' light' : ''}`} href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      <span>{children}</span>
      {!ghost && <b className="lp-cta-dot" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></b>}
    </a>
  )
}

/** The headline chip: the bucket mark in a purple coin, moving right. */
function BucketChip() {
  return (
    <svg viewBox="0 0 132 64" className="lp-chip-svg">
      <rect width="132" height="64" rx="32" fill="#0E091C" />
      <circle cx="32" cy="32" r="26" fill="#6E54FF" opacity="0.3" />
      <circle cx="32" cy="32" r="21" fill="#6E54FF" />
      <path d="M22 26h20l-2.6 14.5H24.6L22 26z" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      <path d="M25.5 26c0-6.5 13-6.5 13 0" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M68 24l8 8-8 8M84 24l8 8-8 8M100 24l8 8-8 8" fill="none" stroke="#fff" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PartFigure({ index }: { index: number }) {
  const Fig = [FigBucket, FigRoutes, FigRules, FigAgent][index]
  return <Fig key={index} />
}

function FigBucket() {
  return (
    <svg viewBox="0 0 240 160" className="lp-fig" role="img" aria-label="A bucket holding the loan and the vault deposit together">
      <path d="M70 52h100l-12 86H82z" fill="none" stroke="#B8B0DC" strokeWidth="2" strokeLinejoin="round" />
      <path d="M86 52c0-36 68-36 68 0" fill="none" stroke="#B8B0DC" strokeWidth="2" strokeLinecap="round" />
      <clipPath id="lp-b"><path d="M70 52h100l-12 86H82z" /></clipPath>
      <g clipPath="url(#lp-b)"><rect className="lp-fill" x="60" y="96" width="120" height="60" fill="#6E54FF" opacity=".7" /></g>
      <text x="120" y="88" textAnchor="middle" fill="#fff" fontSize="12" fontFamily="Geist, sans-serif">loan + vault</text>
    </svg>
  )
}

function FigRoutes() {
  return (
    <svg viewBox="0 0 240 160" className="lp-fig" role="img" aria-label="One loan, three vault routes, the best one lit">
      <circle cx="30" cy="80" r="9" fill="#6E54FF" />
      {[30, 80, 130].map((y, i) => (
        <g key={y}>
          <path d={`M39 80 C110 80 120 ${y} 200 ${y}`} fill="none" stroke={i === 1 ? '#85E6FF' : '#3A3358'} strokeWidth={i === 1 ? 3 : 2} className={i === 1 ? 'lp-dash' : ''} />
          <circle cx="208" cy={y} r="8" fill={i === 1 ? '#85E6FF' : '#3A3358'} />
        </g>
      ))}
    </svg>
  )
}

function FigRules() {
  return (
    <svg viewBox="0 0 240 160" className="lp-fig" role="img" aria-label="A health ruler: the needle falls to the exit line and the bucket exits there">
      <rect x="20" y="74" width="200" height="12" rx="6" fill="#231C3D" />
      <rect x="20" y="74" width="40" height="12" rx="6" fill="#FF8EE4" opacity=".7" />
      <line x1="60" y1="62" x2="60" y2="98" stroke="#fff" strokeWidth="2" />
      <line x1="103" y1="56" x2="103" y2="104" stroke="#8E7BFF" strokeWidth="3" />
      <text x="60" y="118" textAnchor="middle" fill="#B8B0DC" fontSize="11" fontFamily="Geist, sans-serif">1.00</text>
      <text x="103" y="122" textAnchor="middle" fill="#8E7BFF" fontSize="11" fontFamily="Geist, sans-serif">your line</text>
      <rect className="lp-needle" x="185" y="64" width="5" height="32" rx="2.5" fill="#85E6FF" />
    </svg>
  )
}

function FigAgent() {
  return (
    <svg viewBox="0 0 240 160" className="lp-fig" role="img" aria-label="The agent checking every block, like a heartbeat">
      <circle cx="120" cy="80" r="14" fill="#6E54FF" />
      <circle className="lp-ring" cx="120" cy="80" r="14" fill="none" stroke="#6E54FF" strokeWidth="2" />
      <circle className="lp-ring r2" cx="120" cy="80" r="14" fill="none" stroke="#6E54FF" strokeWidth="2" />
      <path d="M20 80h50l10-20 14 40 10-20h16" fill="none" stroke="#85E6FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
