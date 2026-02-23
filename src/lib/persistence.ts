import type { SelectedEntity, EntityGroup, PersistedFavorites, SearchMode } from './types';

const STORAGE_KEY = 'cik-oig-favorites';

type PersonEntry = { firstName: string; lastName: string; middleName?: string; fullName: string };

const DEFAULTS: PersistedFavorites = {
	version: 1,
	entities: [{ name: 'MW MEDICAL INC', cik: '0001059577' }],
	groups: [],
	persons: [{ firstName: 'Daniel', lastName: 'Jung', middleName: 'F.', fullName: 'Daniel F. Jung' }],
	settings: { darkMode: false, defaultSearchMode: 'entity' },
};

export function loadFavorites(): PersistedFavorites {
	if (typeof globalThis.localStorage === 'undefined') {
		return { ...DEFAULTS, entities: [...DEFAULTS.entities], groups: [], persons: [...DEFAULTS.persons], settings: { ...DEFAULTS.settings } };
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULTS, entities: [...DEFAULTS.entities], groups: [], persons: [...DEFAULTS.persons], settings: { ...DEFAULTS.settings } };
		const parsed = JSON.parse(raw) as PersistedFavorites;
		if (parsed.version !== 1) return { ...DEFAULTS, entities: [...DEFAULTS.entities], groups: [], persons: [...DEFAULTS.persons], settings: { ...DEFAULTS.settings } };
		// Migrate legacy 'person' search mode to 'individual'
		const settings = { ...DEFAULTS.settings, ...parsed.settings };
		if ((settings.defaultSearchMode as string) === 'person') {
			settings.defaultSearchMode = 'individual';
		}
		return {
			version: 1,
			entities: parsed.entities || [...DEFAULTS.entities],
			groups: parsed.groups || [],
			persons: parsed.persons || [...DEFAULTS.persons],
			settings,
		};
	} catch {
		return { ...DEFAULTS, entities: [...DEFAULTS.entities], groups: [], persons: [...DEFAULTS.persons], settings: { ...DEFAULTS.settings } };
	}
}

function save(data: Partial<PersistedFavorites>) {
	try {
		const existing = loadFavorites();
		const merged: PersistedFavorites = {
			version: 1,
			entities: data.entities ?? existing.entities,
			groups: data.groups ?? existing.groups,
			persons: data.persons ?? existing.persons,
			settings: data.settings ?? existing.settings,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
	} catch {
		// localStorage full or unavailable
	}
}

export function savePinnedEntities(entities: SelectedEntity[]) {
	save({ entities: entities.filter(e => e.pinned) });
}

export function saveGroups(groups: EntityGroup[]) {
	save({ groups });
}

export function savePinnedPersons(persons: PersonEntry[]) {
	save({ persons });
}

export function saveSettings(darkMode: boolean, defaultSearchMode: SearchMode) {
	save({ settings: { darkMode, defaultSearchMode } });
}

export function clearAllData() {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
