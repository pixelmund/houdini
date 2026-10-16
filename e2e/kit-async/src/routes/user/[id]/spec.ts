import { expect, test } from '@playwright/test'

import { countRequests, gotoHydrated } from '../../../lib/testHelpers.js'

test.describe('awaited query', () => {
	test('renders on the server and hydrates without sending the query again', async ({
		page,
	}) => {
		const requests = await countRequests(page, () => gotoHydrated(page, '/user/1'))

		expect(requests).toBe(0)
		await expect(page.locator('#name')).toHaveText('Bruce Willis')
		await expect(page.locator('#fragment-name')).toHaveText('Bruce Willis')
	})

	test('re-runs when the route parameter changes', async ({ page }) => {
		await gotoHydrated(page, '/user/1')

		const requests = await countRequests(page, () => page.click('#next'))

		expect(requests).toBe(1)
		await expect(page).toHaveURL(/\/user\/2$/)
		await expect(page.locator('#name')).toHaveText('Samuel Jackson')
		await expect(page.locator('#fragment-name')).toHaveText('Samuel Jackson')
	})

	test('going back is served from the cache', async ({ page }) => {
		await gotoHydrated(page, '/user/1')
		await page.click('#next')
		await expect(page.locator('#name')).toHaveText('Samuel Jackson')

		const requests = await countRequests(page, () => page.goBack())

		expect(requests).toBe(0)
		await expect(page.locator('#name')).toHaveText('Bruce Willis')
	})
})
