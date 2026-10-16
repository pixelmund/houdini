import { expect, test } from '@playwright/test'

import { countRequests, gotoHydrated } from '../../lib/testHelpers.js'

test.describe('mutation', () => {
	test('updates the query and fragment through the cache', async ({ page }) => {
		await gotoHydrated(page, '/mutation')

		const name = `Houdini ${Date.now()}`
		await page.fill('#input', name)

		const requests = await countRequests(page, async () => {
			await page.click('#mutate')
			await expect(page.locator('#pending')).toHaveText('true')
		})

		// only the mutation is sent, the query updates from the cache
		expect(requests).toBe(1)
		await expect(page.locator('#name')).toHaveText(name)
		await expect(page.locator('#fragment-name')).toHaveText(name)
		await expect(page.locator('#pending')).toHaveText('false')
	})
})
