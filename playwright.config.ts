import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * CI images and sandboxes often ship a Chromium build whose revision differs
 * from the one this Playwright version expects. Point at the provided binary
 * when there is one, rather than downloading a second copy.
 */
const providedChromium = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const launch = providedChromium ? { executablePath: providedChromium } : {};

/**
 * The primary target is a mid-range Android phone at a 360px viewport, browsing
 * in Arabic (Constitution Principle IV). That is the default project, not an
 * afterthought — desktop is the adaptation.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
  },

  projects: [
    {
      name: 'mobile-ar',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 780 },
        locale: 'ar-EG',
        launchOptions: launch,
      },
    },
    {
      name: 'mobile-en',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 780 },
        locale: 'en-EG',
        launchOptions: launch,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: launch },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/ar',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
