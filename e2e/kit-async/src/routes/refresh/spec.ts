import { expect, test } from '@playwright/test'

import { countRequests, gotoHydrated } from '../../lib/testHelpers.js'

test.describe('refresh', () => {
	test('sends the query again', async ({ page }) => {
		const initial = await countRequests(page, () => gotoHydrated(page, '/refresh'))
		expect(initial).toBe(0)

		const requests = await countRequests(page, () => page.click('#refresh'))

		expect(requests).toBe(1)
		await expect(page.locator('#name')).toHaveText('Samuel Jackson')
	})
})
