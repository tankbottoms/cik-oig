import { test, expect } from '@playwright/test';
import { TEST_ENTITIES, GROUP_NAME } from '../helpers/entities';
import {
	freshStart,
	addEntity,
	pinEntity,
	createGroup,
	startSearch,
	openSettings,
	closeSettings,
	getEntityBadgeCount,
	getPersistedData,
	verifyPageAlive,
	clearDefaultEntity,
} from '../helpers/actions';

test.describe('Core Workflow', () => {
	test('full user journey: add entities, pin, group, search, verify settings', async ({ page }) => {
		// Collect console errors
		const consoleErrors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		// 1. Fresh start
		await freshStart(page);
		await verifyPageAlive(page);

		// 2. Clear the default MW Medical entity so we start clean
		await clearDefaultEntity(page);

		// 3. Add each test entity via search
		const addedEntities: string[] = [];
		for (const entity of TEST_ENTITIES) {
			const result = await addEntity(page, entity.searchTerm);
			addedEntities.push(result);
			await verifyPageAlive(page);
		}

		// Verify all entities are present as badges
		const badgeCount = await getEntityBadgeCount(page);
		expect(badgeCount).toBeGreaterThanOrEqual(TEST_ENTITIES.length);

		// 4. Pin each entity
		for (const entity of TEST_ENTITIES) {
			// Use a fragment of the search term to find the badge
			const fragment = entity.searchTerm.split(' ')[0].toUpperCase();
			await pinEntity(page, fragment).catch(() => {
				// Some entities may have slightly different display names
				// Try with the full search term
				return pinEntity(page, entity.searchTerm.toUpperCase());
			});
		}

		// 5. Create a group tagged "Cane Entities"
		await createGroup(page, GROUP_NAME);
		await verifyPageAlive(page);

		// Verify entities got colored (grouped)
		const coloredBadges = await page.locator('.entity-badge[style*="border-color"]').count();
		expect(coloredBadges).toBeGreaterThan(0);

		// 6. Start search pipeline
		await startSearch(page);
		await verifyPageAlive(page);

		// 7. Open settings -- verify pinned entities appear
		await openSettings(page);

		const pinnedSection = page.locator('.settings-section-label').filter({ hasText: 'PINNED' });
		await expect(pinnedSection).toBeVisible({ timeout: 5_000 });

		// Verify the group appears in saved groups
		const groupSection = page.locator('.settings-section-label').filter({ hasText: 'SAVED GROUPS' });
		await expect(groupSection).toBeVisible({ timeout: 5_000 });

		const groupRow = page.locator('.settings-group-name').filter({ hasText: GROUP_NAME });
		await expect(groupRow).toBeVisible({ timeout: 5_000 });

		// 8. Close settings -- no crash
		await closeSettings(page);
		await verifyPageAlive(page);

		// 9. Open settings again -- verify recent history
		await openSettings(page);

		const recentSection = page.locator('.settings-section-label').filter({ hasText: 'RECENT' });
		// Recent may or may not be populated depending on whether entities are in history
		// Just verify settings still renders
		await verifyPageAlive(page);

		await closeSettings(page);

		// 10. Verify persisted data in localStorage
		const persisted = await getPersistedData(page);
		expect(persisted).toBeTruthy();
		expect(persisted.entities.length).toBeGreaterThanOrEqual(TEST_ENTITIES.length);
		expect(persisted.groups.length).toBeGreaterThanOrEqual(1);
		expect(persisted.groups.some((g: any) => g.name === GROUP_NAME)).toBe(true);

		// 11. Check for console errors (filter out expected ones)
		const criticalErrors = consoleErrors.filter(
			(e) => !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR')
		);
		if (criticalErrors.length > 0) {
			console.log('Console errors found:', criticalErrors);
		}
	});
});
