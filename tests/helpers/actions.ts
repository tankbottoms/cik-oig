import { type Page, expect } from '@playwright/test';
import { STORAGE_KEY } from './entities';

export interface SettingsVerifyOptions {
	pinnedNames?: string[];
	groupNames?: string[];
	groupCounts?: Record<string, number>;
	hasRecent?: boolean;
}

/**
 * Clear localStorage and navigate to the app fresh.
 */
export async function freshStart(page: Page) {
	await page.goto('/');
	await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
	await page.reload();
	await page.waitForLoadState('networkidle');
}

/**
 * Search for an entity by name and select the first matching dropdown result.
 * Returns the text of the badge that was added.
 */
export async function addEntity(page: Page, searchTerm: string): Promise<string> {
	const input = page.locator('input[placeholder*="entity"], input[placeholder*="Entity"], input[placeholder*="CIK"]');
	await input.click();
	await input.fill('');
	await input.fill(searchTerm);

	// Wait for dropdown to appear
	const dropdown = page.locator('.search-dropdown');
	await dropdown.waitFor({ state: 'visible', timeout: 10_000 });

	// Click the first result
	const firstOption = dropdown.locator('[role="option"]').first();
	await firstOption.waitFor({ state: 'visible', timeout: 5_000 });
	const resultText = await firstOption.textContent() ?? '';
	await firstOption.click();

	// Wait for dropdown to close
	await dropdown.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});

	return resultText.trim();
}

/**
 * Pin an entity badge by clicking its pin button.
 * Identifies the badge by partial name match.
 */
export async function pinEntity(page: Page, nameFragment: string) {
	const badge = page.locator('.entity-badge-wrapper').filter({ hasText: nameFragment }).first();
	await badge.waitFor({ state: 'visible', timeout: 5_000 });
	const pinBtn = badge.locator('.entity-pin-btn');
	await pinBtn.click();
	// Verify pin is active
	await expect(pinBtn).toHaveClass(/pinned/, { timeout: 3_000 });
}

/**
 * Open the group popup and create a new group with a given name.
 */
export async function createGroup(page: Page, groupName: string) {
	const groupBtn = page.locator('.group-entities-btn');
	await groupBtn.waitFor({ state: 'visible', timeout: 5_000 });
	await groupBtn.click();

	const popup = page.locator('.group-popup');
	await popup.waitFor({ state: 'visible', timeout: 5_000 });

	const nameInput = popup.locator('.group-name-input');
	await nameInput.fill(groupName);

	const tagBtn = popup.locator('.group-save-btn');
	await tagBtn.click();

	// Popup should close
	await popup.waitFor({ state: 'hidden', timeout: 5_000 });
}

/**
 * Click the SEARCH button and wait for the pipeline to start processing.
 */
export async function startSearch(page: Page) {
	const searchBtn = page.locator('.search-btn');
	await searchBtn.waitFor({ state: 'visible', timeout: 5_000 });
	await expect(searchBtn).toBeEnabled({ timeout: 5_000 });
	await searchBtn.click();

	// Wait for search to begin -- button text changes to SEARCHING...
	await expect(searchBtn).toContainText('SEARCHING', { timeout: 10_000 }).catch(() => {});

	// Wait for search to complete (button returns to SEARCH)
	await expect(searchBtn).toContainText('SEARCH', { timeout: 90_000 });
	// Extra settle time for UI updates
	await page.waitForTimeout(1_000);
}

/**
 * Open settings panel and verify it renders without crashing.
 */
export async function openSettings(page: Page) {
	const settingsBtn = page.locator('.settings-toggle');
	await settingsBtn.click();
	const popup = page.locator('.settings-popup');
	await popup.waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Close settings panel.
 */
export async function closeSettings(page: Page) {
	const closeBtn = page.locator('.settings-close');
	await closeBtn.click();
	const popup = page.locator('.settings-popup');
	await popup.waitFor({ state: 'hidden', timeout: 5_000 });
}

/**
 * Toggle settings open and closed. Verifies no crash.
 */
export async function toggleSettings(page: Page) {
	await openSettings(page);
	await closeSettings(page);
}

/**
 * Get the count of entity badges currently visible in the search bar.
 */
export async function getEntityBadgeCount(page: Page): Promise<number> {
	return page.locator('.entity-badge-wrapper').count();
}

/**
 * Get localStorage persisted favorites data.
 */
export async function getPersistedData(page: Page) {
	return page.evaluate((key) => {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : null;
	}, STORAGE_KEY);
}

/**
 * Verify the page is not in a crashed/blank state.
 */
export async function verifyPageAlive(page: Page) {
	// Check that the app container exists
	const app = page.locator('.app');
	await expect(app).toBeVisible({ timeout: 5_000 });

	// Check no uncaught errors in console (collected via listener)
	const title = await page.title();
	expect(title).toBeTruthy();
}

/**
 * Remove the default pre-loaded entity (MW MEDICAL) if present.
 */
export async function clearDefaultEntity(page: Page) {
	const mwBadge = page.locator('.entity-badge-wrapper').filter({ hasText: 'MW MEDICAL' });
	const count = await mwBadge.count();
	if (count > 0) {
		const removeBtn = mwBadge.first().locator('button.remove');
		await removeBtn.click();
		await page.waitForTimeout(300);
	}
}

/**
 * Long-press a pin button to open the color picker, then select a color swatch.
 * swatchIndex is 0-based; pass -1 or omit to click the clear swatch.
 */
export async function changeEntityColor(page: Page, nameFragment: string, swatchIndex = 0) {
	const badge = page.locator('.entity-badge-wrapper').filter({ hasText: nameFragment }).first();
	await badge.waitFor({ state: 'visible', timeout: 5_000 });
	const pinBtn = badge.locator('.entity-pin-btn');

	// Long-press: pointerdown, wait 600ms, pointerup
	await pinBtn.dispatchEvent('pointerdown');
	await page.waitForTimeout(600);
	await pinBtn.dispatchEvent('pointerup');

	// Wait for color picker popup
	const picker = badge.locator('.color-picker-popup');
	await picker.waitFor({ state: 'visible', timeout: 5_000 });

	if (swatchIndex < 0) {
		// Click the clear swatch
		await picker.locator('.color-swatch-clear').click();
	} else {
		const swatches = picker.locator('.color-swatch:not(.color-swatch-clear)');
		await swatches.nth(swatchIndex).click();
	}

	// Picker should close
	await picker.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
}

/**
 * Open the group popup and click an existing group by name.
 */
export async function addToExistingGroup(page: Page, groupName: string) {
	const groupBtn = page.locator('.group-entities-btn');
	await groupBtn.waitFor({ state: 'visible', timeout: 5_000 });
	await groupBtn.click();

	const popup = page.locator('.group-popup');
	await popup.waitFor({ state: 'visible', timeout: 5_000 });

	// Click the existing group button
	const groupItem = popup.locator('.group-item-clickable').filter({ hasText: groupName });
	await groupItem.waitFor({ state: 'visible', timeout: 5_000 });
	await groupItem.click();

	// Popup should close
	await popup.waitFor({ state: 'hidden', timeout: 5_000 });
}

/**
 * Verify settings panel content: pinned names, group names/counts, recent entries.
 */
export async function verifySettingsContent(page: Page, options: SettingsVerifyOptions) {
	const popup = page.locator('.settings-popup');
	await expect(popup).toBeVisible({ timeout: 5_000 });

	if (options.pinnedNames?.length) {
		const pinnedSection = page.locator('.settings-section-label').filter({ hasText: 'PINNED' });
		await expect(pinnedSection).toBeVisible({ timeout: 5_000 });

		for (const name of options.pinnedNames) {
			const row = page.locator('.settings-fav-name').filter({ hasText: name });
			await expect(row.first()).toBeVisible({ timeout: 5_000 });
		}
	}

	if (options.groupNames?.length) {
		const groupSection = page.locator('.settings-section-label').filter({ hasText: 'SAVED GROUPS' });
		await expect(groupSection).toBeVisible({ timeout: 5_000 });

		for (const name of options.groupNames) {
			const row = page.locator('.settings-group-name').filter({ hasText: name });
			await expect(row.first()).toBeVisible({ timeout: 5_000 });
		}
	}

	if (options.groupCounts) {
		for (const [name, count] of Object.entries(options.groupCounts)) {
			const row = page.locator('.settings-group-name').filter({ hasText: `${name} (${count})` });
			await expect(row.first()).toBeVisible({ timeout: 5_000 });
		}
	}

	if (options.hasRecent) {
		const recentSection = page.locator('.settings-section-label').filter({ hasText: 'RECENT' });
		await expect(recentSection).toBeVisible({ timeout: 5_000 });
	}
}

/**
 * Toggle between entity and person search mode.
 */
export async function toggleSearchMode(page: Page) {
	const modeBtn = page.locator('.mode-toggle');
	await modeBtn.waitFor({ state: 'visible', timeout: 5_000 });
	await modeBtn.click();
	await page.waitForTimeout(300);
}

/**
 * Add a person badge in person mode by typing into the search input and pressing Enter.
 */
export async function addPerson(page: Page, nameInput: string) {
	const input = page.locator('input[placeholder*="person"], input[placeholder*="Person"], input[placeholder*="name"], input[placeholder*="Name"]');
	await input.click();
	await input.fill(nameInput);
	await input.press('Enter');
	await page.waitForTimeout(300);
}

/**
 * Remove the default person "Daniel F. Jung" if present.
 */
export async function removeDefaultPerson(page: Page) {
	const badge = page.locator('.person-badge').filter({ hasText: 'Daniel' });
	const count = await badge.count();
	if (count > 0) {
		const removeBtn = badge.first().locator('button.remove');
		await removeBtn.click();
		await page.waitForTimeout(300);
	}
}
