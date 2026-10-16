import { expect, test } from '@playwright/test'

import { countRequests, gotoHydrated } from '../../lib/testHelpers.js'

test.describe('session', () => {
	test('is sent with queries rendered on the server', async ({ page }) => {
		const requests = await countRequests(page, () => gotoHydrated(page, '/session'))

		expect(requests).toBe(0)
		await expect(page.locator('#session')).toHaveText('1234-Houdini-Token-5678')
	})
})
