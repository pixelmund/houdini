import { expect, test } from '@playwright/test'

import { countRequests, gotoHydrated } from '../../lib/testHelpers.js'

test.describe('query without await', () => {
	test('renders the loading state on the server and loads in the browser', async ({
		page,
		request,
	}) => {
		const html = await (await request.get('/non-blocking')).text()
		expect(html).toContain('<p id="loading">true</p>')

		const requests = await countRequests(page, () => gotoHydrated(page, '/non-blocking'))

		expect(requests).toBe(1)
		await expect(page.locator('#name')).toHaveText('Bruce Willis')
		await expect(page.locator('#loading')).toHaveText('false')
	})

	test('reacts to state changes', async ({ page }) => {
		await gotoHydrated(page, '/non-blocking')
		await expect(page.locator('#name')).toHaveText('Bruce Willis')

		const requests = await countRequests(page, async () => {
			await page.click('#next')
			await expect(page.locator('#loading')).toHaveText('true')
		})

		expect(requests).toBe(1)
		await expect(page.locator('#name')).toHaveText('Samuel Jackson')
		await expect(page.locator('#loading')).toHaveText('false')
	})
})
