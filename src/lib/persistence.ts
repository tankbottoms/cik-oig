import type { SelectedEntity, EntityGroup, PersistedFavorites, SearchMode } from './types';

const STORAGE_KEY = 'cik-oig-favorites';
const CURRENT_VERSION = 1;

function getDefaults(): PersistedFavorites {
	return {
		version: CURRENT_VERSION,
		entities: [],
		groups: [],
		persons: [],
		entityHistory: [],
		settings: { darkMode: false, defaultSearchMode: 'entity' },
	};
}

export function loadFavorites(): PersistedFavorites {
	try {
		if (typeof window === 'undefined') return getDefaults();
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return getDefaults();
		const parsed = JSON.parse(stored);
		const defaults = getDefaults();
		// Ensure all required fields exist (handles data from older versions)
		return {
			version: parsed.version ?? defaults.version,
			entities: Array.isArray(parsed.entities) ? parsed.entities : defaults.entities,
			groups: Array.isArray(parsed.groups) ? parsed.groups : defaults.groups,
			persons: Array.isArray(parsed.persons) ? parsed.persons : defaults.persons,
			entityHistory: Array.isArray(parsed.entityHistory) ? parsed.entityHistory : defaults.entityHistory,
			settings: parsed.settings ?? defaults.settings,
		};
	} catch {
		return getDefaults();
	}
}

export function saveFavorites(data: PersistedFavorites): void {
	try {
		if (typeof window === 'undefined') return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {
		// Silently fail on quota exceeded or disabled storage
	}
}

export function savePinnedEntities(entities: SelectedEntity[]): void {
	const fav = loadFavorites();
	fav.entities = entities.filter(e => e.pinned);
	saveFavorites(fav);
}

export function saveGroups(groups: EntityGroup[]): void {
	const fav = loadFavorites();
	fav.groups = groups;
	saveFavorites(fav);
}

export function savePinnedPersons(persons: Array<{ firstName: string; lastName: string; middleName?: string; fullName: string }>): void {
	const fav = loadFavorites();
	fav.persons = persons;
	saveFavorites(fav);
}

export function saveSettings(settings: PersistedFavorites['settings']): void {
	const fav = loadFavorites();
	fav.settings = settings;
	saveFavorites(fav);
}

export function loadPinnedEntities(): SelectedEntity[] {
	return loadFavorites().entities;
}

export function loadGroups(): EntityGroup[] {
	return loadFavorites().groups;
}

export function loadPinnedPersons(): Array<{ firstName: string; lastName: string; middleName?: string; fullName: string }> {
	return loadFavorites().persons;
}

export function loadSettings(): PersistedFavorites['settings'] {
	return loadFavorites().settings;
}

export function clearAllPersisted(): void {
	try {
		if (typeof window !== 'undefined') {
			localStorage.removeItem(STORAGE_KEY);
		}
	} catch {
		// Silently fail
	}
}
