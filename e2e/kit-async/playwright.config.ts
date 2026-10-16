import { defineConfig } from '@playwright/test'

export default defineConfig({
	testMatch: 'spec.ts',
	use: {
		baseURL: 'http://localhost:3037',
		headless: true,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		timezoneId: 'UTC',
	},
	timeout: process.env.CI ? 60000 : 30000,
	retries: process.env.CI ? 3 : 0,
	workers: 3,
	reporter: [['list']],
	webServer: {
		command: 'npm run build && npm run preview-e2e',
		port: 3037,
		timeout: 120 * 1000,
		reuseExistingServer: !process.env.CI,
	},
})
