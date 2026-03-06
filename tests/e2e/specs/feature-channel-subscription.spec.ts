/* tests/e2e/specs/feature-channel-subscription.spec.ts */

import { test, expect } from '@playwright/test'
import { waitForHydration, setupHydrationErrorCollector } from './helpers/hydration.js'

test.describe('feature: channel & subscription', () => {
	test('displays title from loader data', async ({ page }) => {
		const getErrors = setupHydrationErrorCollector(page)
		await page.goto('/', { waitUntil: 'networkidle' })
		await waitForHydration(page)

		await expect(page.locator('h1')).toHaveText('Channel & Subscription Demo')
		expect(getErrors()).toHaveLength(0)
	})

	test('subscription receives ticks via SSE', async ({ page }) => {
		// Use domcontentloaded — networkidle waits for SSE to finish,
		// which would make the subscription already "closed"
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await waitForHydration(page)

		const status = page.locator('[data-testid="sub-status"]')
		const tick = page.locator('[data-testid="sub-tick"]')

		// Should eventually become active (on first data)
		await expect(status).toContainText('active', { timeout: 10_000 })
		await expect(tick).not.toContainText('Tick: 0')

		// 5 ticks at 500ms = ~2.5s, then status becomes closed
		await expect(status).toContainText('closed', { timeout: 10_000 })
	})

	test('subscription shows active status while receiving', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await waitForHydration(page)

		const status = page.locator('[data-testid="sub-status"]')

		// Should reach active (first data event)
		await expect(status).toContainText('active', { timeout: 10_000 })

		// Eventually closed after all ticks
		await expect(status).toContainText('closed', { timeout: 10_000 })
	})

	test('channel connects and receives echo messages', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })
		await waitForHydration(page)

		// Connect the channel
		await page.click('button:has-text("Connect Channel")')

		// Wait for input to appear (means channel is connected)
		const input = page.locator('[data-testid="ch-input"]')
		await expect(input).toBeVisible({ timeout: 5_000 })

		// Send a message
		await input.fill('hello world')
		await page.click('button:has-text("Send")')

		// Verify the echoed message appears
		const messageList = page.locator('[data-testid="ch-messages"]')
		await expect(messageList.locator('[data-testid="ch-message"]')).toHaveCount(1, {
			timeout: 5_000,
		})
		await expect(messageList.locator('[data-testid="ch-message"]').first()).toHaveText(
			'hello world',
		)
	})

	test('channel receives multiple messages', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' })
		await waitForHydration(page)

		await page.click('button:has-text("Connect Channel")')
		const input = page.locator('[data-testid="ch-input"]')
		await expect(input).toBeVisible({ timeout: 5_000 })

		// Send first message
		await input.fill('message one')
		await page.click('button:has-text("Send")')
		await expect(
			page.locator('[data-testid="ch-messages"] [data-testid="ch-message"]'),
		).toHaveCount(1, { timeout: 5_000 })

		// Send second message
		await input.fill('message two')
		await page.click('button:has-text("Send")')
		await expect(
			page.locator('[data-testid="ch-messages"] [data-testid="ch-message"]'),
		).toHaveCount(2, { timeout: 5_000 })

		// Verify content
		const messages = page.locator('[data-testid="ch-messages"] [data-testid="ch-message"]')
		await expect(messages.nth(0)).toHaveText('message one')
		await expect(messages.nth(1)).toHaveText('message two')
	})
})
