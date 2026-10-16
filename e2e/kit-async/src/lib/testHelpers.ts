import { expect, type Page } from '@playwright/test'

export const API = 'http://localhost:4000/graphql'

// gotoHydrated opens a page and waits for it to become interactive
export async function gotoHydrated(page: Page, url: string) {
	await page.goto(url)
	await expect(page.locator('#hydrated')).toHaveText('true')
}

// countRequests counts the graphql requests the browser sends while running the action
export async function countRequests(page: Page, action: () => Promise<unknown>, settle = 750) {
	let count = 0
	const listener = (request: { url(): string }) => {
		if (request.url() === API) {
			count++
		}
	}
	page.on('request', listener)
	try {
		await action()
		await page.waitForTimeout(settle)
	} finally {
		page.off('request', listener)
	}
	return count
}
