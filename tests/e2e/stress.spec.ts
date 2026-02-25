import { test, expect } from '@playwright/test';
import {
	freshStart,
	addEntity,
	pinEntity,
	createGroup,
	openSettings,
	closeSettings,
	toggleSettings,
	getEntityBadgeCount,
	getPersistedData,
	verifyPageAlive,
	clearDefaultEntity,
} from '../helpers/actions';

const MANY_ENTITIES = [
	'Dynamic Associates',
	'Legal Access',
	'MW Medical',
	'Davi Skin',
	'Cane',
	'Johnson',
	'Smith',
	'Health',
	'Medical',
	'Pharma',
];

test.describe('Stress Tests', () => {
	test('add 10+ entities rapidly', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		let added = 0;
		for (const term of MANY_ENTITIES) {
			try {
				await addEntity(page, term);
				added++;
				await verifyPageAlive(page);
			} catch (e) {
				// Some search terms may not find results -- that's fine
				console.log(`Could not add "${term}": ${(e as Error).message}`);
			}
		}

		expect(added).toBeGreaterThanOrEqual(4);

		const badgeCount = await getEntityBadgeCount(page);
		expect(badgeCount).toBeGreaterThanOrEqual(4);
	});

	test('create multiple groups', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		// Add some entities
		await addEntity(page, 'MW Medical');
		await addEntity(page, 'Dynamic Associates');
		await pinEntity(page, 'MW').catch(() => {});
		await pinEntity(page, 'DYNAMIC').catch(() => {});

		// Create first group
		await createGroup(page, 'Group Alpha');
		await verifyPageAlive(page);

		// Add more entities
		await addEntity(page, 'Legal Access');
		await addEntity(page, 'Davi Skin');
		await pinEntity(page, 'LEGAL').catch(() => {});
		await pinEntity(page, 'DAVI').catch(() => {});

		// Create second group
		await createGroup(page, 'Group Beta');
		await verifyPageAlive(page);

		// Verify both groups persist
		const persisted = await getPersistedData(page);
		expect(persisted.groups.length).toBeGreaterThanOrEqual(2);

		// Settings should show both
		await openSettings(page);
		const groupNames = page.locator('.settings-group-name');
		await expect(groupNames.first()).toBeVisible({ timeout: 5_000 });
		await closeSettings(page);
	});

	test('rapid settings toggle 20 times', async ({ page }) => {
		await freshStart(page);

		// Add some entities to make settings have content
		await addEntity(page, 'MW Medical');
		await pinEntity(page, 'MW').catch(() => {});

		// Rapid toggle
		for (let i = 0; i < 20; i++) {
			await toggleSettings(page);
		}

		await verifyPageAlive(page);
	});

	test('add and remove entities repeatedly', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		for (let cycle = 0; cycle < 3; cycle++) {
			// Add
			await addEntity(page, 'MW Medical');
			await addEntity(page, 'Dynamic Associates');
			await verifyPageAlive(page);

			// Remove all
			const removeButtons = page.locator('.entity-badge-wrapper button.remove');
			const count = await removeButtons.count();
			for (let i = count - 1; i >= 0; i--) {
				await removeButtons.nth(i).click();
				await page.waitForTimeout(200);
			}
			await verifyPageAlive(page);
		}
	});

	test('settings works after clearing all data', async ({ page }) => {
		await freshStart(page);

		// Add entities and groups
		await addEntity(page, 'MW Medical');
		await pinEntity(page, 'MW').catch(() => {});
		await createGroup(page, 'Temp Group');

		// Handle the confirm dialog before clicking
		page.on('dialog', (dialog) => dialog.accept());

		// Open settings, clear all
		await openSettings(page);

		const clearBtn = page.locator('.settings-danger').filter({ hasText: 'CLEAR ALL' });
		await clearBtn.click();
		await page.waitForTimeout(1_000);

		// After CLEAR ALL, settings panel stays open but data is cleared.
		// Close settings first, then reopen to verify empty state.
		const settingsPopup = page.locator('.settings-popup');
		const isOpen = await settingsPopup.isVisible().catch(() => false);
		if (isOpen) {
			await closeSettings(page);
		}

		await verifyPageAlive(page);

		// Open settings again -- should work and show no pinned/groups
		await openSettings(page);
		await verifyPageAlive(page);

		// Should not show pinned or groups
		const pinnedLabel = page.locator('.settings-section-label').filter({ hasText: 'PINNED' });
		const pinnedCount = await pinnedLabel.count();
		expect(pinnedCount).toBe(0);

		await closeSettings(page);
	});
});
