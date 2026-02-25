import { test, expect } from '@playwright/test';
import { TEST_ENTITIES, EXTRA_ENTITIES, TEST_PERSONS, GROUP_NAME } from '../helpers/entities';
import {
	freshStart,
	addEntity,
	pinEntity,
	createGroup,
	addToExistingGroup,
	startSearch,
	openSettings,
	closeSettings,
	changeEntityColor,
	verifySettingsContent,
	toggleSearchMode,
	removeDefaultPerson,
	getPersistedData,
	verifyPageAlive,
	clearDefaultEntity,
} from '../helpers/actions';

// --- Lightweight tests first (no external API calls) ---

test.describe('Group Name Display', () => {
	test('settings shows tag name not generic "Group" label', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		await addEntity(page, 'MW Medical');
		await addEntity(page, 'Dynamic Associates');
		await pinEntity(page, 'MW').catch(() => {});
		await pinEntity(page, 'DYNAMIC').catch(() => {});
		await createGroup(page, GROUP_NAME);

		await openSettings(page);

		const groupRow = page.locator('.settings-group-name').filter({ hasText: GROUP_NAME });
		await expect(groupRow.first()).toBeVisible({ timeout: 5_000 });

		const text = await groupRow.first().textContent();
		expect(text).toMatch(new RegExp(`${GROUP_NAME}\\s*\\(\\d+\\)`));

		await closeSettings(page);
	});
});

test.describe('Color Picker', () => {
	test('long-press opens picker and selecting color changes badge style', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		await addEntity(page, 'MW Medical');
		await pinEntity(page, 'MW').catch(() => {});

		await changeEntityColor(page, 'MW', 0);

		const badge = page.locator('.entity-badge').filter({ hasText: 'MW' }).first();
		const style = await badge.getAttribute('style');
		expect(style).toBeTruthy();
		expect(style).toContain('border-color');

		await verifyPageAlive(page);
	});

	test('same color on multiple entities creates a group', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		await addEntity(page, 'MW Medical');
		await addEntity(page, 'Dynamic Associates');
		await pinEntity(page, 'MW').catch(() => {});
		await pinEntity(page, 'DYNAMIC').catch(() => {});

		await changeEntityColor(page, 'MW', 0);
		await changeEntityColor(page, 'DYNAMIC', 0);

		const persisted = await getPersistedData(page);
		expect(persisted).toBeTruthy();
		expect(persisted.groups.length).toBeGreaterThanOrEqual(1);

		const groupBtn = page.locator('.group-entities-btn');
		if ((await groupBtn.count()) > 0) {
			await groupBtn.click();
			const popup = page.locator('.group-popup');
			await popup.waitFor({ state: 'visible', timeout: 5_000 });
			const existingLabel = popup
				.locator('.group-section-label')
				.filter({ hasText: 'ADD TO EXISTING' });
			await expect(existingLabel).toBeVisible({ timeout: 5_000 });
			await page.locator('.search-box').click({ position: { x: 5, y: 5 } });
		}

		await verifyPageAlive(page);
	});
});

test.describe('Person Mode', () => {
	test('toggle to person mode, add persons, search without hang', async ({ page }) => {
		const consoleErrors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await freshStart(page);

		await toggleSearchMode(page);
		await page.waitForTimeout(500);

		const personIcon = page.locator('.mode-toggle i.fa-thin.fa-user');
		await expect(personIcon).toBeVisible({ timeout: 5_000 });

		const defaultBadge = page.locator('.person-badge').filter({ hasText: 'Daniel' });
		if ((await defaultBadge.count()) > 0) {
			await removeDefaultPerson(page);
		}

		const input = page.locator('.search-input-wrapper input');
		for (const person of TEST_PERSONS) {
			await input.click();
			await input.fill(person.input);
			await input.press('Enter');
			await page.waitForTimeout(300);
		}

		const personBadges = page.locator('.person-badge');
		const badgeCount = await personBadges.count();
		expect(badgeCount).toBeGreaterThanOrEqual(1);

		const searchBtn = page.locator('.search-btn');
		await expect(searchBtn).toBeEnabled({ timeout: 5_000 });
		await searchBtn.click();

		// Should not hang indefinitely (the OIG person mode bug)
		await expect(searchBtn).toContainText('SEARCH', { timeout: 90_000 });

		await verifyPageAlive(page);

		await toggleSearchMode(page);
		await verifyPageAlive(page);

		const criticalErrors = consoleErrors.filter(
			(e) => !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR'),
		);
		if (criticalErrors.length > 0) {
			console.log('Person mode console errors:', criticalErrors);
		}
	});
});

// --- Heavy tests last (these call startSearch which hits external APIs) ---

test.describe('Recent History', () => {
	test('entities appear in settings Recent section after search', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		await addEntity(page, 'MW Medical');
		await addEntity(page, 'Dynamic Associates');
		await startSearch(page);

		await openSettings(page);
		await verifySettingsContent(page, { hasRecent: true });
		await closeSettings(page);

		await verifyPageAlive(page);
	});
});

test.describe('Tag/Group Bug Scenario', () => {
	test('add entities, create tag, add MORE entities to existing tag, verify settings + search', async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await freshStart(page);
		await verifyPageAlive(page);
		await clearDefaultEntity(page);

		// Add first batch
		for (const entity of TEST_ENTITIES) {
			await addEntity(page, entity.searchTerm);
			await verifyPageAlive(page);
		}

		// Pin them all
		for (const entity of TEST_ENTITIES) {
			const fragment = entity.searchTerm.split(' ')[0].toUpperCase();
			await pinEntity(page, fragment).catch(() =>
				pinEntity(page, entity.searchTerm.toUpperCase()),
			);
		}

		// Create group
		await createGroup(page, GROUP_NAME);
		await verifyPageAlive(page);

		// Verify initial group in settings
		await openSettings(page);
		await verifySettingsContent(page, { groupNames: [GROUP_NAME] });
		await closeSettings(page);

		// Add MORE entities (the bug scenario)
		const extraAdded: string[] = [];
		for (const entity of EXTRA_ENTITIES) {
			try {
				await addEntity(page, entity.searchTerm);
				extraAdded.push(entity.searchTerm);
				await verifyPageAlive(page);
			} catch {
				// Some search terms may not find results
			}
		}

		// Pin new entities
		for (const term of extraAdded) {
			const fragment = term.split(' ')[0].toUpperCase();
			await pinEntity(page, fragment).catch(() => {});
		}

		// Assign to EXISTING group (the exact bug trigger)
		if (extraAdded.length > 0) {
			await addToExistingGroup(page, GROUP_NAME);
			await verifyPageAlive(page);
		}

		// Settings should still work
		await openSettings(page);
		await verifySettingsContent(page, { groupNames: [GROUP_NAME] });
		await closeSettings(page);
		await verifyPageAlive(page);

		// Search should still work
		await startSearch(page);
		await verifyPageAlive(page);

		// Settings after search
		await openSettings(page);
		await verifySettingsContent(page, { groupNames: [GROUP_NAME] });
		await closeSettings(page);

		// Persisted data integrity
		const persisted = await getPersistedData(page);
		expect(persisted).toBeTruthy();
		expect(persisted.groups.length).toBeGreaterThanOrEqual(1);
		expect(persisted.groups.some((g: any) => g.name === GROUP_NAME)).toBe(true);

		const criticalErrors = consoleErrors.filter(
			(e) => !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR'),
		);
		if (criticalErrors.length > 0) {
			console.log('Console errors found:', criticalErrors);
		}
	});
});
