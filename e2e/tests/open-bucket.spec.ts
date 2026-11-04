import type { Locator, Page } from '@playwright/test'
import { testWithSynpress } from '@synthetixio/synpress'
import { type MetaMask, metaMaskFixtures } from '@synthetixio/synpress/playwright'
import setup from '../wallet-setup/fork.setup'

const test = testWithSynpress(metaMaskFixtures(setup))
const { expect } = test

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // anvil account #0
const WETH = '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242'
const RPC = 'http://127.0.0.1:8545'
const MINED = { timeout: 90_000 } // a mined tx plus the app's 1-second polling
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}` // same as app/src/format.ts short()

// Plain JSON-RPC reads. Selectors are keccak256(signature)[0:4].
async function call(to: string, data: string): Promise<bigint[]> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  })
  const { result, error } = await res.json()
  if (error) throw new Error(`eth_call to ${to} failed: ${error.message}`)
  return (result.slice(2).match(/.{64}/g) ?? []).map((w: string) => BigInt(`0x${w}`))
}
const wethOf = async (who: string) => (await call(WETH, `0x70a08231${who.slice(2).toLowerCase().padStart(64, '0')}`))[0] // balanceOf(address)
const positionOf = (bucket: string) => call(bucket, '0x09218e91') // position(): collateral, shares, vaultAssets, idle, debt, health

// MetaMask closes its popup a moment after you answer it. Without this wait, the next
// metamask.* call can grab that closing popup instead of the new one ("Target page ... has been closed").
const popupClosed = (page: Page) =>
  expect.poll(() => page.context().pages().filter((p) => p.url().includes('/notification.html')).length).toBe(0)

async function connect(page: Page, metamask: MetaMask) {
  const header = page.locator('header')
  await header.getByRole('button', { name: 'Connect wallet' }).click()
  await metamask.connectToDapp()
  await expect(header.getByRole('button', { name: short(ACCOUNT) })).toBeVisible()
  await popupClosed(page)
}

/** Picks the first route that can be opened (view-only rows have a disabled toggle) and fills the form. */
async function fillOpenForm(page: Page, weth: string, usdc: string) {
  const pick = page.getByTestId('route-row').getByRole('button', { name: 'Choose route', disabled: false }).first()
  await pick.click()
  await expect(pick).toHaveAttribute('aria-pressed', 'true')
  const form = page.getByTestId('open-form')
  await form.getByLabel('WETH to supply').fill(weth)
  await form.getByLabel('USDC to borrow').fill(usdc) // after WETH, or the app re-fills it for health 1.50
  await form.getByLabel('Exit if health falls below').fill('1.15')
  await expect(form.getByLabel('Exit by (optional)')).toHaveValue('')
  await expect(form.getByLabel('Tip for the agent (%)')).toHaveValue('0.1')
  await expect(form.getByText(/Wallet: [\d,.]+ WETH/)).toBeVisible() // balance and allowance arrive in one read
  return form
}

/** Step 1. Skipped only if an earlier, interrupted run left enough allowance. */
async function approveWeth(form: Locator, metamask: MetaMask) {
  const cta = form.locator('button[type="submit"]')
  await expect(cta).toHaveText(/^(Approve WETH|Open bucket)$/)
  if ((await cta.textContent()) === 'Open bucket') return
  await cta.click()
  await expect(cta).toHaveText('Confirm in your wallet')
  await metamask.approveTokenPermission() // MetaMask shows approve() as a spending-cap screen: Next, then Approve
  await expect(cta).toHaveText('Open bucket', MINED)
  await popupClosed(form.page())
}

test('connect: header shows account #0 and the fork network', async ({ page, metamask }) => {
  await page.goto('/#discover')
  await connect(page, metamask)
  const header = page.locator('header')
  await expect(header.getByRole('button', { name: short(ACCOUNT) })).toHaveAttribute('title', ACCOUNT)
  await expect(header).toContainText('Local fork of Monad')
  await expect(header).toContainText('chain 143')
  await expect(page.getByText('Your wallet is on another network')).toBeHidden()
})

test.describe('bucket lifecycle', () => {
  test.describe.configure({ mode: 'serial' }) // the later tests use the bucket the first one opens
  let bucket = ''

  test('open a bucket: 0.5 WETH in, 400 USDC borrowed, exit line 1.15', async ({ page, metamask }) => {
    await page.goto('/#discover')
    await connect(page, metamask)
    const form = await fillOpenForm(page, '0.5', '400')
    await approveWeth(form, metamask)

    const open = form.getByRole('button', { name: 'Open bucket' })
    await expect(open).toBeEnabled()
    await open.click()
    await expect(form.getByRole('button', { name: 'Confirm in your wallet' })).toBeVisible()
    await metamask.confirmTransaction()

    await expect(page).toHaveURL(/#bucket-0x[0-9a-fA-F]{40}$/, MINED)
    bucket = new URL(page.url()).hash.slice('#bucket-'.length)
    await expect(page.getByRole('heading', { name: 'Your bucket' })).toBeVisible()
    await expect(page.getByTestId('bucket-status')).toHaveText('Open')
    await expect(page.getByRole('heading', { name: 'What it holds' }).locator('..')).toContainText('0.5000 WETH')
    await expect(page.getByRole('heading', { name: 'What it owes' })).toBeVisible()
    await expect.poll(async () => Number(await page.getByTestId('bucket-health').textContent())).toBeGreaterThan(1.5)
    await expect(page.getByRole('heading', { name: 'History' }).locator('..')).toContainText('Opened')
  })

  test('my money: #home lists that bucket under "Your buckets"', async ({ page, metamask }) => {
    await page.goto('/#home')
    await connect(page, metamask)
    const item = page.getByRole('region', { name: 'Your buckets' }).getByRole('link').filter({ hasText: short(bucket) })
    await expect(item).toBeVisible()
    await expect(item).toHaveAttribute('href', `#bucket-${bucket}`)
    await expect(item).toContainText(/Health \d/) // still open, with a loan
  })

  test('exit: Exit now repays the loan and sends the WETH back', async ({ page, metamask }) => {
    await page.goto(`/#bucket-${bucket}`)
    await connect(page, metamask)
    await expect(page.getByRole('heading', { name: 'Your bucket' })).toBeVisible()
    await expect(page.getByTestId('bucket-status')).toHaveText('Open')
    const before = await wethOf(ACCOUNT)

    await page.getByRole('button', { name: 'Exit now' }).click()
    await expect(page.getByRole('button', { name: 'Confirm in your wallet' })).toBeVisible()
    await metamask.confirmTransaction()

    await expect(page.getByTestId('bucket-status')).toHaveText('Closed', MINED)
    await expect(page.getByRole('heading', { name: 'History' }).locator('..')).toContainText('Exited', MINED)
    // Onchain: the loan is gone (dust allowed) and the owner got the collateral back (no tip on an owner exit).
    const [, , , , debt] = await positionOf(bucket)
    expect(debt).toBeLessThanOrEqual(10_000n)
    expect((await wethOf(ACCOUNT)) - before).toBeGreaterThanOrEqual(4999n * 10n ** 14n) // >= 0.4999 WETH
  })
})

test('guard rail: a borrow far above the limit cannot be opened and the app says why', async ({ page, metamask }) => {
  await page.goto('/#discover')
  await connect(page, metamask)
  const form = await fillOpenForm(page, '0.3', '2000')
  await expect(form.getByText(/^Health after: [\d.]+, below your exit line$/)).toBeVisible()
  // The borrow limit is checked before step 1, so neither step can be pressed (label depends on leftover allowance).
  const cta = form.locator('button[type="submit"]')
  await expect(cta).toHaveText(/^(Approve WETH|Open bucket)$/)
  await expect(cta).toBeDisabled()
  await expect(form.getByText(/^Aave lends at most [\d,.]+ USDC against 0\.3000 WETH\.$/)).toBeVisible()
})
