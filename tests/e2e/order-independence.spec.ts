import { test, expect } from '@playwright/test';
import { TEST_ENTITIES, GROUP_NAME } from '../helpers/entities';
import {
	freshStart,
	addEntity,
	pinEntity,
	createGroup,
	startSearch,
	toggleSettings,
	getEntityBadgeCount,
	getPersistedData,
	verifyPageAlive,
	clearDefaultEntity,
} from '../helpers/actions';

test.describe('Order Independence', () => {
	test('add all then pin all then group', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		// Add all entities first
		for (const entity of TEST_ENTITIES) {
			await addEntity(page, entity.searchTerm);
		}
		await verifyPageAlive(page);

		// Then pin all
		for (const entity of TEST_ENTITIES) {
			const fragment = entity.searchTerm.split(' ')[0].toUpperCase();
			await pinEntity(page, fragment).catch(() => {});
		}

		// Then group
		await createGroup(page, GROUP_NAME);
		await toggleSettings(page);
		await verifyPageAlive(page);

		const persisted = await getPersistedData(page);
		expect(persisted.groups.length).toBeGreaterThanOrEqual(1);
	});

	test('pin immediately after each add, then group', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		// Add and pin each entity one at a time
		for (const entity of TEST_ENTITIES) {
			await addEntity(page, entity.searchTerm);
			const fragment = entity.searchTerm.split(' ')[0].toUpperCase();
			await pinEntity(page, fragment).catch(() => {});
			await verifyPageAlive(page);
		}

		// Then group
		await createGroup(page, GROUP_NAME);
		await verifyPageAlive(page);
	});

	test('group first entity, then add more and search', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		// Add just one, group it
		await addEntity(page, TEST_ENTITIES[0].searchTerm);
		const fragment0 = TEST_ENTITIES[0].searchTerm.split(' ')[0].toUpperCase();
		await pinEntity(page, fragment0).catch(() => {});
		await createGroup(page, 'First Group');

		// Add more entities
		for (let i = 1; i < TEST_ENTITIES.length; i++) {
			await addEntity(page, TEST_ENTITIES[i].searchTerm);
		}

		// Search with mixed pinned/unpinned
		await startSearch(page);
		await verifyPageAlive(page);
		await toggleSettings(page);
		await verifyPageAlive(page);
	});

	test('search before pinning or grouping', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		// Add entities
		for (const entity of TEST_ENTITIES) {
			await addEntity(page, entity.searchTerm);
		}

		// Search immediately (no pins, no groups)
		await startSearch(page);
		await verifyPageAlive(page);

		// Now pin and group after search
		for (const entity of TEST_ENTITIES) {
			const fragment = entity.searchTerm.split(' ')[0].toUpperCase();
			await pinEntity(page, fragment).catch(() => {});
		}
		await createGroup(page, GROUP_NAME);

		await toggleSettings(page);
		await verifyPageAlive(page);

		const persisted = await getPersistedData(page);
		expect(persisted.entities.length).toBeGreaterThanOrEqual(TEST_ENTITIES.length);
	});

	test('settings toggle between every operation', async ({ page }) => {
		await freshStart(page);
		await clearDefaultEntity(page);

		await toggleSettings(page);

		await addEntity(page, TEST_ENTITIES[0].searchTerm);
		await toggleSettings(page);

		const fragment = TEST_ENTITIES[0].searchTerm.split(' ')[0].toUpperCase();
		await pinEntity(page, fragment).catch(() => {});
		await toggleSettings(page);

		await addEntity(page, TEST_ENTITIES[1].searchTerm);
		await toggleSettings(page);

		await createGroup(page, 'Mid Group');
		await toggleSettings(page);

		await addEntity(page, TEST_ENTITIES[2].searchTerm);
		await addEntity(page, TEST_ENTITIES[3].searchTerm);
		await toggleSettings(page);

		await startSearch(page);
		await toggleSettings(page);

		await verifyPageAlive(page);
	});
});
