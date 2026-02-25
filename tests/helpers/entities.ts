/** Test entity data -- these are real SEC-registered entities */
export interface TestEntity {
	searchTerm: string;
	expectedName: string;
	expectedCik: string;
}

export const TEST_ENTITIES: TestEntity[] = [
	{
		searchTerm: 'Dynamic Associates',
		expectedName: 'DYNAMIC ASSOCIATES',
		expectedCik: '0001909492',
	},
	{
		searchTerm: 'Legal Access',
		expectedName: 'LEGAL ACCESS TECHNOLOGIES',
		expectedCik: '0001909736',
	},
	{
		searchTerm: 'MW Medical',
		expectedName: 'MW MEDICAL INC',
		expectedCik: '0001059577',
	},
	{
		searchTerm: 'Davi Skin',
		expectedName: 'DAVI SKIN',
		expectedCik: '0001819446',
	},
];

/** Extra entities used to test adding more entities to an existing group */
export const EXTRA_ENTITIES: TestEntity[] = [
	{
		searchTerm: 'Cane',
		expectedName: 'CANE',
		expectedCik: '', // resolved at runtime
	},
	{
		searchTerm: 'Health',
		expectedName: 'HEALTH',
		expectedCik: '', // resolved at runtime
	},
];

/** Person names for person mode tests */
export const TEST_PERSONS = [
	{ input: 'Smith, John', expected: 'John Smith' },
	{ input: 'Jane Doe', expected: 'Jane Doe' },
];

export const GROUP_NAME = 'Cane Entities';

export const STORAGE_KEY = 'cik-oig-favorites';
