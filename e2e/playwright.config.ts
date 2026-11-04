import { defineConfig } from '@playwright/test'

// One MetaMask profile, one chain, real transactions: run one test at a time, never retry silently.
export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000, // wallet popups plus 1-second blocks
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 30_000,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
})
