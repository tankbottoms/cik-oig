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
	toggleSettings,
	verifyPageAlive,
	clearDefaultEntity,
} from '../helpers/actions';

test.describe('Settings Resilience', () => {
	test('settings open/close at every stage without crashing', async ({ page }) => {
		const consoleErrors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await freshStart(page);

		// Stage 0: Toggle settings on empty state
		await toggleSettings(page);
		await verifyPageAlive(page);

		// Remove default entity
		await clearDefaultEntity(page);

		// Stage 1: Toggle settings after clearing default
		await toggleSettings(page);
		await verifyPageAlive(page);

		// Stage 2: Add one entity, toggle settings
		await addEntity(page, TEST_ENTITIES[0].searchTerm);
		await toggleSettings(page);
		await verifyPageAlive(page);

		// Stage 3: Add second entity, toggle settings
		await addEntity(page, TEST_ENTITIES[1].searchTerm);
		await toggleSettings(page);
		await verifyPageAlive(page);

		// Stage 4: Pin an entity, toggle settings
		const fragment = TEST_ENTITIES[0].searchTerm.split(' ')[0].toUpperCase();
		await pinEntity(page, fragment);
		await toggleSettings(page);
		await verifyPageAlive(page);

		// Stage 5: Add remaining entities
		await addEntity(page, TEST_ENTITIES[2].searchTerm);
		await addEntity(page, TEST_ENTITIES[3].searchTerm);
		await toggleSettings(page);
		await verifyPageAlive(page);

		// Stage 6: Create group, toggle settings
		await createGroup(page, GROUP_NAME);
		await toggleSettings(page);
		await verifyPageAlive(page);

		// Stage 7: Start search, toggle settings during/after
		await startSearch(page);
		await toggleSettings(page);
		await verifyPageAlive(page);

		// Stage 8: Open settings, verify content, close
		await openSettings(page);
		const body = page.locator('.settings-body');
		await expect(body).toBeVisible({ timeout: 5_000 });
		await closeSettings(page);

		// Stage 9: Rapid toggle 5 times
		for (let i = 0; i < 5; i++) {
			await toggleSettings(page);
		}
		await verifyPageAlive(page);
	});

	test('settings shows correct data after entity operations', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		// Add and pin two entities
		await addEntity(page, 'MW Medical');
		await addEntity(page, 'Dynamic Associates');
		await pinEntity(page, 'MW');
		await pinEntity(page, 'DYNAMIC');

		// Create a group
		await createGroup(page, 'Test Group');

		// Open settings and verify
		await openSettings(page);

		// Should show pinned entities
		const pinnedLabel = page.locator('.settings-section-label').filter({ hasText: 'PINNED' });
		await expect(pinnedLabel).toBeVisible({ timeout: 5_000 });

		// Should show the group
		const groupLabel = page.locator('.settings-section-label').filter({ hasText: 'SAVED GROUPS' });
		await expect(groupLabel).toBeVisible({ timeout: 5_000 });

		await closeSettings(page);
		await verifyPageAlive(page);
	});
});
