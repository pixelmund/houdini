import { expect, test } from '@playwright/test'

import { gotoHydrated } from '../../lib/testHelpers.js'

test.describe('subscription', () => {
	test('receives events while it is read', async ({ page }) => {
		await gotoHydrated(page, '/subscription')
		await expect(page.locator('#connected')).toHaveText('true')

		const name = `Subscribed ${Date.now()}`
		await page.fill('#input', name)

		// the socket connects asynchronously, so keep mutating until an event arrives
		await expect(async () => {
			await page.click('#mutate')
			await expect(page.locator('#update')).toHaveText(name, { timeout: 1000 })
		}).toPass({ timeout: 10000 })
	})
})
