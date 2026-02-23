<script lang="ts">
	import { tick, onMount, onDestroy } from 'svelte';
	import { fuzzyMatch } from '$lib/search/fuzzy-match';
	import { logLines, extractedNames, isSearching, addLog, clearLog } from '$lib/stores';
	import type { HealthcareEntity, SelectedEntity, SECSubmission, ParsedName, ExtractedNameResult, OIGSearchResult, FilingRef, SearchMode, PersistedFavorites } from '$lib/types';
	import { loadFavorites, savePinnedEntities, saveGroups, savePinnedPersons, saveSettings, saveFavorites } from '$lib/persistence';

	// Auto-scroll terminal log
	$effect(() => {
		$logLines;
		tick().then(() => {
			const el = document.getElementById('terminal-log');
			if (el) el.scrollTop = el.scrollHeight;
		});
	});

	let { data } = $props();

	// CIK bucket cache
	const bucketCache: Record<string, HealthcareEntity[]> = {};
	const loadingBuckets = new Set<string>();

	async function loadBucket(key: string): Promise<HealthcareEntity[]> {
		if (bucketCache[key]) return bucketCache[key];
		if (loadingBuckets.has(key)) {
			while (loadingBuckets.has(key)) await new Promise(r => setTimeout(r, 50));
			return bucketCache[key] || [];
		}
		loadingBuckets.add(key);
		try {
			const resp = await fetch(`/data/cik_${key}.json`);
			if (!resp.ok) return [];
			const entries: HealthcareEntity[] = await resp.json();
			bucketCache[key] = entries;
			return entries;
		} catch { return []; }
		finally { loadingBuckets.delete(key); }
	}

	async function searchAllEntities(query: string, limit = 10): Promise<SelectedEntity[]> {
		if (!query.trim() || query.trim().length < 2) return [];
		const queryLower = query.toLowerCase();
		const firstChar = queryLower.match(/[a-z]/)?.[0];
		const bucketsToSearch: HealthcareEntity[][] = [];

		if (firstChar) bucketsToSearch.push(await loadBucket(firstChar));
		for (const [key, entries] of Object.entries(bucketCache)) {
			if (key !== firstChar) bucketsToSearch.push(entries);
		}
		if (/^\d/.test(query.trim())) {
			const numBucket = await loadBucket('_');
			if (numBucket.length > 0) bucketsToSearch.push(numBucket);
		}

		const allResults: Array<{ name: string; cik: string; score: number }> = [];
		const seen = new Set<string>();
		for (const entities of bucketsToSearch) {
			for (const e of entities) {
				const key = `${e.c}_${e.n}`;
				if (seen.has(key)) continue;
				const score = Math.max(fuzzyMatch(e.n, query), fuzzyMatch(e.c, query));
				if (score > 0) {
					seen.add(key);
					allResults.push({ name: e.n, cik: e.c, score });
				}
			}
		}
		return allResults.sort((a, b) => b.score - a.score).slice(0, limit).map(({ name, cik }) => ({ name, cik }));
	}

	// Load persisted favorites on init
	let persistedFavorites = $state(loadFavorites());

	$effect(() => {
		console.log(`[SETTINGS-EFFECT] Running, settingsOpen=${settingsOpen}`);
		if (settingsOpen) {
			try {
				console.log(`[SETTINGS] Loading favorites for settings panel`);
				persistedFavorites = loadFavorites();
				console.log(`[SETTINGS] Loaded: ${persistedFavorites?.entities?.length || 0} entities, ${persistedFavorites?.groups?.length || 0} groups`);
			} catch (e) {
				console.error(`[SETTINGS] Error loading favorites:`, e);
			}
		}
	});

	// State - MW Medical pre-loaded as default entity
	let query = $state('');
	let selectedEntities: SelectedEntity[] = $state(
		(persistedFavorites?.entities?.length ?? 0) > 0
			? persistedFavorites.entities
			: [{ name: 'MW MEDICAL INC', cik: '0001059577' }]
	);
	let dropdownResults: SelectedEntity[] = $state([]);
	let dropdownVisible = $state(false);
	let highlightedIndex = $state(0);
	let searchActive = $state((persistedFavorites?.entities?.length ?? 0) > 0);
	let inputEl: HTMLInputElement | undefined = $state();
	let loadingDropdown = $state(false);
	let logExpanded = $state(false);
	let darkMode = $state(persistedFavorites?.settings?.darkMode ?? false);
	let searchMode: SearchMode = $state(persistedFavorites?.settings?.defaultSearchMode ?? 'entity');
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	// Person mode state
	let selectedPersons: Array<{ firstName: string; lastName: string; middleName?: string; fullName: string }> = $state(
		(persistedFavorites?.persons?.length ?? 0) > 0
			? persistedFavorites.persons
			: [{ firstName: 'Daniel', lastName: 'Jung', middleName: 'F.', fullName: 'Daniel F. Jung' }]
	);

	// Entity pin + color grouping
	const PASTEL_COLORS = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E8BAFF', '#FFB3E6', '#C4C4C4'];
	let entityGroups: Array<{ id: string; name: string; color: string; entityCiks: string[]; createdAt: number }> = $state(persistedFavorites?.groups ?? []);
	let colorPickerTarget: string | null = $state(null);
	let longPressTimer: ReturnType<typeof setTimeout> | undefined;
	let longPressTriggered = false;
	let groupTagInput = $state('');
	let groupPopupOpen = $state(false);
	let groupInputRef: HTMLInputElement | undefined = $state();
	let groupPopupRef: HTMLDivElement | undefined = $state();
	let groupBtnRef: HTMLButtonElement | undefined = $state();

	// Auto-persist pinned entities
	$effect(() => {
		try {
			savePinnedEntities(selectedEntities);
		} catch (e) {
			console.error('Error persisting entities:', e);
		}
	});

	// Auto-persist groups
	$effect(() => {
		try {
			saveGroups(entityGroups);
		} catch (e) {
			console.error('Error persisting groups:', e);
		}
	});

	// Auto-persist persons
	$effect(() => {
		try {
			savePinnedPersons(selectedPersons);
		} catch (e) {
			console.error('Error persisting persons:', e);
		}
	});

	// Auto-persist settings
	$effect(() => {
		try {
			saveSettings({ darkMode, defaultSearchMode: searchMode });
		} catch (e) {
			console.error('Error persisting settings:', e);
		}
	});

	// Close popups on click-outside
	function handleDocumentClick(e: MouseEvent) {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const targetClass = target.className;

		// Close group popup if clicking outside it and its toggle button
		if (groupPopupOpen) {
			if (!target.closest?.('.group-popup') && !target.closest?.('.group-entities-btn')) {
				groupPopupOpen = false;
			}
		}
		// Close color picker if clicking outside any color picker
		if (colorPickerTarget) {
			if (!target.closest?.('.color-picker-popup') && !target.closest?.('.entity-pin-btn')) {
				colorPickerTarget = null;
			}
		}
		// Close settings if clicking outside
		if (settingsOpen) {
			const inSettings = target.closest?.('.settings-popup');
			const isSettingsBtn = target.closest?.('.settings-toggle');
			if (!inSettings && !isSettingsBtn) {
				console.log(`[SETTINGS] Closing settings, clicked on: ${targetClass}`);
				settingsOpen = false;
			}
		}
	}

	// Pre-pin Robert B. Spertell on mount and check against OIG
	onMount(async () => {
		document.addEventListener('click', handleDocumentClick);
		// Apply dark mode theme if persisted
		if (darkMode) {
			document.documentElement.setAttribute('data-theme', 'dark');
		}
		const alreadyExists = $extractedNames.some(n => n.name.lastName.toLowerCase() === 'spertell');
		if (!alreadyExists) {
			extractedNames.update(names => [...names, {
				name: { firstName: 'Robert', lastName: 'Spertell', middleName: 'B.', fullName: 'Robert B. Spertell', source: 'Pre-loaded' },
				oigStatus: 'pending' as const,
				source: 'Pre-loaded',
				filings: [],
				pinned: true,
			}]);
		}
		// Check pre-loaded names against OIG
		const pending = $extractedNames.filter(n => n.oigStatus === 'pending');
		if (pending.length > 0) {
			try {
				const resp = await fetch('/api/oig/search', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						names: pending.map(n => ({ firstName: n.name.firstName, lastName: n.name.lastName, middleName: n.name.middleName })),
					}),
				});
				const result = await resp.json();
				updateOIGResults(result.results);
			} catch {
				// Silently fail for pre-loaded check
			}
		}
	});

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('click', handleDocumentClick);
		}
	});

	function onInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			if (query.trim().length >= 2) {
				loadingDropdown = true;
				dropdownResults = await searchAllEntities(query);
				loadingDropdown = false;
				dropdownVisible = dropdownResults.length > 0;
				highlightedIndex = 0;
			} else {
				dropdownVisible = false;
				dropdownResults = [];
			}
		}, 150);
	}

	function selectEntity(entity: SelectedEntity) {
		if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = undefined; }
		if (!selectedEntities.some(e => e.cik === entity.cik && e.name === entity.name)) {
			console.log(`[ENTITY] Adding entity #${selectedEntities.length + 1}: ${entity.name}`);
			selectedEntities = [...selectedEntities, entity];
			console.log(`[ENTITY] Total entities now: ${selectedEntities.length}`);
		}
		query = '';
		dropdownVisible = false;
		dropdownResults = [];
		colorPickerTarget = null;
		tick().then(() => {
			if (inputEl) inputEl.value = '';
			inputEl?.focus();
		});
	}

	function removeEntity(cik: string, name: string) {
		if (colorPickerTarget === `${cik}_${name}`) colorPickerTarget = null;
		selectedEntities = selectedEntities.filter(e => !(e.cik === cik && e.name === name));
		rebuildGroups();
	}

	function addPersonBadge() {
		const nameInput = query.trim();
		if (!nameInput) return;
		const parsed = parsePersonName(nameInput);
		const fullName = `${parsed.firstName}${parsed.middleName ? ' ' + parsed.middleName : ''} ${parsed.lastName}`;
		if (!selectedPersons.some(p => p.fullName.toLowerCase() === fullName.toLowerCase())) {
			selectedPersons = [...selectedPersons, { ...parsed, fullName }];
		}
		query = '';
	}

	function removePerson(fullName: string) {
		selectedPersons = selectedPersons.filter(p => p.fullName !== fullName);
	}

	function toggleEntityPin(cik: string, name: string) {
		if (longPressTriggered) { longPressTriggered = false; return; }
		console.log(`[PIN] Toggling pin for ${name} (currently pinned: ${selectedEntities.find(e => e.cik === cik && e.name === name)?.pinned ?? false})`);
		selectedEntities = selectedEntities.map(e =>
			e.cik === cik && e.name === name ? { ...e, pinned: !e.pinned } : e
		);
		console.log(`[PIN] Pin toggled, pinned count: ${selectedEntities.filter(e => e.pinned).length}`);
	}

	function setEntityColor(cik: string, name: string, color: string) {
		// Find which group this entity belongs to (if any)
		const entity = selectedEntities.find(e => e.cik === cik && e.name === name);
		const oldColor = entity?.color;

		// Update all entities that share the old color (grouped entities) with new color
		selectedEntities = selectedEntities.map(e => {
			if (oldColor && e.color === oldColor) {
				return { ...e, color: color || undefined };
			} else if (e.cik === cik && e.name === name) {
				return { ...e, color: color || undefined };
			}
			return e;
		});
		colorPickerTarget = null;
		rebuildGroups();
	}

	function handlePinPointerDown(entityKey: string) {
		longPressTriggered = false;
		if (longPressTimer) clearTimeout(longPressTimer);
		longPressTimer = setTimeout(() => {
			longPressTriggered = true;
			colorPickerTarget = colorPickerTarget === entityKey ? null : entityKey;
		}, 500);
	}

	function handlePinPointerUp() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = undefined;
		}
	}

	function rebuildGroups() {
		const colorMap = new Map<string, string[]>();
		for (const e of selectedEntities) {
			if (e.color) {
				const ciks = colorMap.get(e.color) || [];
				ciks.push(e.cik);
				colorMap.set(e.color, ciks);
			}
		}
		entityGroups = Array.from(colorMap.entries())
			.filter(([_, ciks]) => ciks.length >= 1)
			.map(([color, entityCiks]) => {
				const existing = entityGroups.find(g => g.color === color);
				const persisted = persistedFavorites?.groups?.find((g: any) => g.color === color);
				return {
					id: existing?.id || persisted?.id || crypto.randomUUID(),
					name: existing?.name || persisted?.name || 'Group',
					color,
					entityCiks,
					createdAt: existing?.createdAt || persisted?.createdAt || Date.now(),
				};
			});
	}

	function renameGroup(groupId: string, name: string) {
		entityGroups = entityGroups.map(g => g.id === groupId ? { ...g, name } : g);
	}

	function clearSearch() {
		// Always allow clearing, even mid-search
		isSearching.set(false);
		// Keep pinned entities, clear unpinned
		selectedEntities = selectedEntities.filter(e => e.pinned);
		selectedPersons = (persistedFavorites?.persons?.length ?? 0) > 0
			? persistedFavorites.persons
			: [{ firstName: 'Daniel', lastName: 'Jung', middleName: 'F.', fullName: 'Daniel F. Jung' }];
		query = '';
		clearLog();
		colorPickerTarget = null;
		groupPopupOpen = false;
		// Clear non-pinned extracted names and reset match state
		extractedNames.update(names => names.filter(n => n.pinned));
		dismissedMatches = new Set();
		collapsedMatches = new Set();
		if ($extractedNames.filter(n => n.pinned).length === 0 && selectedEntities.length === 0) {
			searchActive = false;
		}
		inputEl?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (dropdownVisible) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				highlightedIndex = Math.min(highlightedIndex + 1, dropdownResults.length - 1);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				highlightedIndex = Math.max(highlightedIndex - 1, 0);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				if (dropdownResults[highlightedIndex]) selectEntity(dropdownResults[highlightedIndex]);
			} else if (e.key === 'Tab') {
				e.preventDefault();
				if (dropdownResults[highlightedIndex]) selectEntity(dropdownResults[highlightedIndex]);
			} else if (e.key === 'Escape') {
				dropdownVisible = false;
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (searchMode === 'person' && query.trim()) {
				addPersonBadge();
			} else {
				startPipeline();
			}
		} else if (e.key === 'Backspace' && query === '') {
			if (searchMode === 'entity' && selectedEntities.length > 0) {
				selectedEntities = selectedEntities.slice(0, -1);
			} else if (searchMode === 'person' && selectedPersons.length > 0) {
				selectedPersons = selectedPersons.slice(0, -1);
			}
		}
	}

	let dropdownEl: HTMLDivElement | undefined = $state();

	function onBlur(e: FocusEvent) {
		// If focus moved to something inside the dropdown, don't hide it
		if (dropdownEl?.contains(e.relatedTarget as Node)) return;
		setTimeout(() => { dropdownVisible = false; }, 150);
	}

	function togglePin(nameKey: string) {
		extractedNames.update(names =>
			names.map(n => {
				const key = `${n.name.firstName}_${n.name.lastName}`.toLowerCase();
				if (key === nameKey) return { ...n, pinned: !n.pinned };
				return n;
			})
		);
	}

	// SEC filing URL builder
	function buildFilingUrl(cik: string, accession: string, primaryDoc: string): string {
		const cikClean = cik.replace(/^0+/, '') || cik;
		const accNoDash = accession.replace(/-/g, '');
		return `https://www.sec.gov/Archives/edgar/data/${cikClean}/${accNoDash}/${primaryDoc}`;
	}

	// OIG verify URL - proxies through our API which fetches the ASP.NET ViewState
	// tokens and returns a self-submitting form that POSTs to the OIG site
	function buildOIGVerifyUrl(lastName: string, firstName: string): string {
		return `/api/oig/verify?lastName=${encodeURIComponent(lastName)}&firstName=${encodeURIComponent(firstName)}`;
	}

	// Format OIG exclusion type for display
	function formatExclType(raw: string): string {
		// Convert "1128a2" -> "1128(a)(2)"
		return raw.replace(/(\d+)([a-z])(\d+)?/gi, (_, num, letter, sub) => {
			let s = `${num}(${letter})`;
			if (sub) s += `(${sub})`;
			return s;
		});
	}

	// Format OIG date YYYYMMDD -> MM/DD/YYYY
	function formatOIGDate(raw: string): string {
		if (!raw || raw === '00000000' || raw.length !== 8) return '';
		return `${raw.slice(4, 6)}/${raw.slice(6, 8)}/${raw.slice(0, 4)}`;
	}

	const FORM_PRIORITY: Record<string, number> = {
		'DEF 14A': 1, 'PRE 14A': 1, 'DEFS14A': 1, 'PRES14A': 1,
		'10-K': 2, '10-K/A': 2, '10KSB': 2, '10KSB/A': 2, '10-KSB': 2, '10-KSB/A': 2,
		'10-Q': 3, '10-Q/A': 3, '10QSB': 3, '10QSB/A': 3, '10-QSB': 3,
		'8-K': 4, '8-K/A': 4, 'S-1': 5, 'S-1/A': 5,
	};
	function filingPriority(form: string): number { return FORM_PRIORITY[form] || 99; }
	function formatSize(bytes: number): string {
		if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
		if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${bytes} B`;
	}

	function toggleSearchMode() {
		searchMode = searchMode === 'entity' ? 'person' : 'entity';
		query = '';
		dropdownVisible = false;
		dropdownResults = [];
		colorPickerTarget = null;
		inputEl?.focus();
	}

	function parsePersonName(input: string): { firstName: string; lastName: string; middleName?: string } {
		const trimmed = input.trim();
		// "Last, First" or "Last, First Middle"
		if (trimmed.includes(',')) {
			const [last, rest] = trimmed.split(',').map(s => s.trim());
			const restParts = rest.split(/\s+/);
			return { lastName: last, firstName: restParts[0] || '', middleName: restParts.slice(1).join(' ') || undefined };
		}
		// "First Last" or "First Middle Last"
		const parts = trimmed.split(/\s+/);
		if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
		return {
			firstName: parts[0],
			lastName: parts[parts.length - 1],
			middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined,
		};
	}

	async function startPipeline() {
		if ($isSearching) return;

		if (searchMode === 'person') {
			if (selectedPersons.length === 0) return;
			searchActive = true;
			isSearching.set(true);
			clearLog();
			try {
				for (const person of selectedPersons) {
					addLog(`Searching OIG for "${person.lastName}, ${person.firstName}"...`, 'fetch');
					await directNameSearch(person.fullName);
				}
				const names = $extractedNames;
				addLog(
					`Complete. ${names.filter(n => n.oigStatus !== 'pending').length} checked, ${names.filter(n => n.oigStatus === 'match').length} matches found`,
					'info'
				);
			} catch (err) {
				addLog(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
			} finally {
				isSearching.set(false);
			}
			return;
		}

		const hasCikEntities = selectedEntities.length > 0;
		const hasDirectName = query.trim().length > 0;
		if (!hasCikEntities && !hasDirectName) return;

		searchActive = true;
		isSearching.set(true);
		clearLog();

		try {
			if (hasDirectName && !hasCikEntities) {
				await directNameSearch(query.trim());
				return;
			}
			for (const entity of selectedEntities) {
				await processEntity(entity);
			}
			if (hasDirectName) {
				await directNameSearch(query.trim());
			}
			const names = $extractedNames;
			addLog(
				`Complete. ${names.length} names extracted, ${names.filter(n => n.oigStatus !== 'pending').length} checked, ${names.filter(n => n.oigStatus === 'match').length} matches found`,
				'info'
			);
		} catch (err) {
			addLog(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
		} finally {
			isSearching.set(false);
		}
	}

	async function directNameSearch(nameStr: string) {
		addLog(`Checking "${nameStr}" against OIG exclusion list...`, 'fetch');
		const parts = nameStr.split(/\s+/);
		const firstName = parts[0] || '';
		const lastName = parts[parts.length - 1] || '';
		const middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined;

		const nameEntry: ExtractedNameResult = {
			name: { firstName, lastName, middleName, fullName: nameStr, source: 'Direct search' },
			oigStatus: 'pending',
			source: 'Direct search',
			filings: [],
			pinned: false,
		};
		extractedNames.update(n => [...n, nameEntry]);

		try {
			const resp = await fetch('/api/oig/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ names: [{ firstName, lastName, middleName }], businesses: [nameStr] }),
			});
			const result = await resp.json();
			updateOIGResults(result.results);
		} catch (err) {
			addLog(`OIG check failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error');
		}
	}

	async function processEntity(entity: SelectedEntity) {
		recordEntityHistory(entity);
		addLog(`Fetching submissions for CIK ${entity.cik}...`, 'fetch');
		const resp = await fetch(`/api/submissions/${entity.cik}`);
		if (!resp.ok) { addLog(`Failed to fetch submissions: ${resp.statusText}`, 'error'); return; }

		const sub: SECSubmission = await resp.json();
		if (sub.filings.length === 0) { addLog(`No filings found for ${sub.name}`, 'info'); return; }

		const dateRange = `${sub.filings[0].date} to ${sub.filings[sub.filings.length - 1].date}`;
		addLog(`Found ${sub.filings.length} filings (${dateRange})`, 'found');
		if (sub.sic) addLog(`SIC: ${sub.sic} - ${sub.sicDescription}`, 'info');

		// Populate entity with filing metadata
		const filingDates = sub.filings.map(f => f.date).sort();
		const formTypes = new Set<string>();
		sub.filings.forEach(f => formTypes.add(f.form));
		selectedEntities = selectedEntities.map(e =>
			e.cik === entity.cik ? {
				...e,
				earliestFiling: filingDates[0] || '',
				latestFiling: filingDates[filingDates.length - 1] || '',
				filingCount: sub.filings.length,
				sicCode: sub.sic,
				sicDescription: sub.sicDescription,
				tickers: sub.tickers,
				formTypes: Array.from(formTypes),
			} : e
		);

		const priorityFilings = [...sub.filings]
			.sort((a, b) => filingPriority(a.form) - filingPriority(b.form))
			.slice(0, 20);

		const allExtractedNames: ParsedName[] = [];

		for (const filing of priorityFilings) {
			const filingUrl = buildFilingUrl(entity.cik, filing.accession, filing.primaryDoc);
			addLog(
				`[${filing.form}] ${filing.date}  ${filing.primaryDoc}  ${formatSize(filing.size)}`,
				'fetch',
				filingUrl
			);
			if (!filing.primaryDoc) continue;

			try {
				const fResp = await fetch(
					`/api/filings/${entity.cik}/${filing.accession}?doc=${encodeURIComponent(filing.primaryDoc)}&form=${encodeURIComponent(filing.form)}`
				);
				if (!fResp.ok) { addLog(`  Failed: ${fResp.statusText}`, 'error'); continue; }

				const fData = await fResp.json();
				const filingRef: FilingRef = {
					form: filing.form,
					date: filing.date,
					accession: filing.accession,
					primaryDoc: filing.primaryDoc,
					cik: entity.cik,
					url: fData.url || filingUrl,
				};

				if (fData.names && fData.names.length > 0) {
					const newNames = fData.names.filter(
						(n: ParsedName) => !allExtractedNames.some(
							e => e.firstName.toLowerCase() === n.firstName.toLowerCase() &&
								e.lastName.toLowerCase() === n.lastName.toLowerCase()
						)
					);
					allExtractedNames.push(...newNames);

					if (newNames.length > 0) {
						addLog(`  Found: ${newNames.map((n: ParsedName) => n.fullName).join(', ')}`, 'found', filingRef.url);

						const entries: ExtractedNameResult[] = newNames.map((n: ParsedName) => ({
							name: n,
							oigStatus: 'pending' as const,
							source: `${filing.form} ${filing.date}`,
							filings: [filingRef],
							pinned: false,
						}));

						extractedNames.update(existing => {
							const result = [...existing];
							for (const entry of entries) {
								const idx = result.findIndex(
									x => x.name.firstName.toLowerCase() === entry.name.firstName.toLowerCase() &&
										x.name.lastName.toLowerCase() === entry.name.lastName.toLowerCase()
								);
								if (idx >= 0) {
									// Merge filing refs
									const existingFilings = result[idx].filings || [];
									if (!existingFilings.some(f => f.accession === filingRef.accession)) {
										result[idx] = { ...result[idx], filings: [...existingFilings, filingRef] };
									}
								} else {
									result.push(entry);
								}
							}
							return result;
						});
					}
				}

				if (allExtractedNames.length >= 3) {
					await checkNamesAgainstOIG(allExtractedNames.splice(0));
					allExtractedNames.length = 0;
				}
			} catch (err) {
				addLog(`  Error: ${err instanceof Error ? err.message : 'Unknown'}`, 'error');
			}
		}

		if (allExtractedNames.length > 0) {
			await checkNamesAgainstOIG(allExtractedNames);
		}
	}

	async function checkNamesAgainstOIG(names: ParsedName[]) {
		addLog(`Checking ${names.length} name(s) against OIG exclusion list...`, 'fetch');
		try {
			const resp = await fetch('/api/oig/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ names: names.map(n => ({ firstName: n.firstName, lastName: n.lastName, middleName: n.middleName })) }),
			});
			const result = await resp.json();
			updateOIGResults(result.results);
		} catch (err) {
			addLog(`OIG check failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'error');
		}
	}

	function updateOIGResults(results: OIGSearchResult[]) {
		const logged = new Set<string>();
		for (const result of results) {
			const nameParts = result.queriedName.split(' ');
			const firstName = nameParts[0]?.toLowerCase() || '';
			const lastName = nameParts[nameParts.length - 1]?.toLowerCase() || '';
			const logKey = `${firstName}_${lastName}`;

			extractedNames.update(names =>
				names.map(n => {
					if (n.name.firstName.toLowerCase() === firstName && n.name.lastName.toLowerCase() === lastName) {
						const status = result.status === 'MATCH' ? 'match' as const
							: result.status === 'POSSIBLE_MATCH' ? 'possible_match' as const
							: 'clear' as const;

						// Only log once per name (avoid duplicates from individual+business results)
						if (!logged.has(logKey)) {
							logged.add(logKey);
							if (status === 'match') addLog(`${result.queriedName} - MATCH (${result.matches[0]?.exclType})`, 'match');
							else if (status === 'possible_match') addLog(`${result.queriedName} - POSSIBLE MATCH`, 'match');
							else addLog(`${result.queriedName} - NOT FOUND`, 'clear');
						}

						// Keep the more severe status if already set (match > possible > clear)
						const severity = { match: 3, possible_match: 2, clear: 1, pending: 0 };
						if (severity[status] >= severity[n.oigStatus] || n.oigStatus === 'pending') {
							return { ...n, oigStatus: status, oigMatches: result.matches.length > 0 ? result.matches : n.oigMatches };
						}
					}
					return n;
				})
			);
		}
	}

	function toggleTheme() {
		darkMode = !darkMode;
		document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : '');
	}

	function statusBadgeClass(status: ExtractedNameResult['oigStatus']): string {
		switch (status) {
			case 'clear': return 'badge-clear';
			case 'match': return 'badge-match';
			case 'possible_match': return 'badge-possible';
			default: return 'badge-checking';
		}
	}

	function statusLabel(status: ExtractedNameResult['oigStatus'], matches?: any[]): string {
		switch (status) {
			case 'clear': return 'CLEAR';
			case 'match': return `MATCH - ${matches?.[0]?.exclType || ''}`;
			case 'possible_match': return 'POSSIBLE';
			default: return 'CHECKING...';
		}
	}

	function formatTimestamp(ts: number): string {
		return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	// C1: Filing popup
	function openFilingPopup(url: string, form: string, date: string) {
		window.open(url, `filing_${form}_${date}`, 'width=1000,height=700,scrollbars=yes,resizable=yes');
	}

	// C2: Settings
	let settingsOpen = $state(false);

	// C4: Entity grouping glyph - add to existing group
	function addEntitiesToGroup(groupId: string) {
		try {
			const group = entityGroups.find(g => g.id === groupId);
			if (!group) return;

			// Apply group color to all uncolored selected entities
			selectedEntities = selectedEntities.map(e => {
				if (!e.color) {
					return { ...e, color: group.color };
				}
				return e;
			});
			rebuildGroups();
			groupPopupOpen = false;
		} catch (e) {
			console.error('Error adding entities to group:', e);
		}
	}

	// Create new group
	function saveEntityGroup() {
		try {
			console.log(`[GROUP] Starting saveEntityGroup with ${selectedEntities.length} entities`);
			if (!groupTagInput.trim()) return;
			const tagName = groupTagInput.trim();
			console.log(`[GROUP] Tag name: "${tagName}"`);

			// Pick a color not already in use
			const usedColors = new Set(entityGroups.map(g => g.color));
			console.log(`[GROUP] Used colors: ${Array.from(usedColors).join(', ')}, PASTEL_COLORS length: ${PASTEL_COLORS.length}`);
			const available = PASTEL_COLORS.filter(c => !usedColors.has(c));
			const color = available.length > 0
				? available[Math.floor(Math.random() * available.length)]
				: PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
			console.log(`[GROUP] Assigned color: ${color}, available colors: ${available.length}`);

			// Assign color to all uncolored entities
			console.log(`[GROUP] Before color assignment: ${selectedEntities.filter(e => !e.color).length} uncolored entities`);
			selectedEntities = selectedEntities.map(e => e.color ? e : { ...e, color });
			console.log(`[GROUP] After color assignment: ${selectedEntities.filter(e => e.color).length} colored entities`);

			// Build group directly
			const newGroup = {
				id: crypto.randomUUID(),
				name: tagName,
				color,
				entityCiks: selectedEntities.filter(e => e.color === color).map(e => e.cik),
				createdAt: Date.now(),
			};
			console.log(`[GROUP] New group created: ${newGroup.name} with ${newGroup.entityCiks.length} entities`);

			// Merge with existing groups (rebuild from entity colors, then override name for this color)
			console.log(`[GROUP] Calling rebuildGroups() with ${selectedEntities.length} entities`);
			rebuildGroups();
			console.log(`[GROUP] Rebuilt groups: ${entityGroups.length} groups`);

			console.log(`[GROUP] Updating group names...`);
			entityGroups = entityGroups.map(g => g.color === color ? { ...g, name: tagName, id: newGroup.id } : g);
			console.log(`[GROUP] Updated group name, completed. Total groups: ${entityGroups.length}`);

			groupTagInput = '';
			groupPopupOpen = false;
			console.log(`[GROUP] saveEntityGroup completed successfully`);
		} catch (e) {
			console.error('Error saving entity group:', e, e instanceof Error ? e.stack : '');
		}
	}

	// Focus group input when popup opens
	$effect(() => {
		if (groupPopupOpen) {
			setTimeout(() => groupInputRef?.focus(), 0);
		}
	});

	// C6: OIG collapse/dismiss
	let dismissedMatches: Set<string> = $state(new Set());
	let collapsedMatches: Set<string> = $state(new Set());

	function toggleCollapseMatch(key: string) {
		const next = new Set(collapsedMatches);
		next.has(key) ? next.delete(key) : next.add(key);
		collapsedMatches = next;
	}

	function dismissMatch(key: string) {
		const next = new Set(dismissedMatches);
		next.add(key);
		dismissedMatches = next;
	}

	// Derived status counts
	let clearCount = $derived($extractedNames.filter(n => n.oigStatus === 'clear').length);
	let matchCount = $derived($extractedNames.filter(n => n.oigStatus === 'match').length);
	let possibleCount = $derived($extractedNames.filter(n => n.oigStatus === 'possible_match').length);

	// Record entity to history
	function recordEntityHistory(entity: SelectedEntity) {
		const fav = loadFavorites();
		const history = fav.entityHistory ?? [];
		const alreadyThere = history.some(e => e.cik === entity.cik);
		if (!alreadyThere) {
			fav.entityHistory = [entity, ...history].slice(0, 200);
			saveFavorites(fav);
		}
	}

	// Settings panel helpers
	function quickAddEntity(entity: SelectedEntity) {
		if (!selectedEntities.some(e => e.cik === entity.cik)) {
			selectedEntities = [...selectedEntities, entity];
		}
		if (!searchActive) searchActive = true;
	}

	function quickLoadGroup(group: any) {
		const savedEntities = (persistedFavorites?.entities ?? []).filter(e => group.entityCiks.includes(e.cik));
		for (const entity of savedEntities) {
			if (!selectedEntities.some(e => e.cik === entity.cik)) {
				selectedEntities = [...selectedEntities, { ...entity, color: group.color }];
			}
		}
		rebuildGroups();
		if (!searchActive) searchActive = true;
	}

	function removeFavoriteEntity(cik: string) {
		const fav = loadFavorites();
		fav.entities = fav.entities.filter(e => e.cik !== cik);
		saveFavorites(fav);
	}

	function clearAllData() {
		if (confirm('Clear all pinned entities, groups, and history?')) {
			saveFavorites({
				version: 1,
				entities: [],
				groups: [],
				persons: [],
				entityHistory: [],
				settings: persistedFavorites?.settings ?? { darkMode: false, defaultSearchMode: 'entity' },
			});
			persistedFavorites = loadFavorites();
		}
	}

	function clearLocalStorage() {
		if (confirm('This will clear ALL localStorage data (entities, groups, history, settings). Are you sure?')) {
			try {
				localStorage.clear();
				persistedFavorites = loadFavorites();
				selectedEntities = [];
				selectedPersons = [{ firstName: 'Daniel', lastName: 'Jung', middleName: 'F.', fullName: 'Daniel F. Jung' }];
				entityGroups = [];
				searchActive = false;
				settingsOpen = false;
			} catch (e) {
				console.error('Failed to clear cache:', e);
			}
		}
	}
</script>

<div class="app" class:search-active={searchActive}>
	<div class="top-controls">
		<button class="settings-toggle" onclick={() => {
			console.log(`[SETTINGS] Clicked, current state: ${settingsOpen}, searchActive: ${searchActive}`);
			settingsOpen = !settingsOpen;
			console.log(`[SETTINGS] New state: ${settingsOpen}`);
		}} title="Settings">
			<i class="fa-thin fa-gear"></i>
		</button>
		<button class="theme-toggle" onclick={toggleTheme} title="Toggle dark mode">
			{darkMode ? 'LIGHT' : 'DARK'}
		</button>
	</div>

	{#if settingsOpen}
		<div class="settings-popup">
			<div class="settings-header">
				<span>Settings</span>
				<button class="settings-close" onclick={() => settingsOpen = false}>x</button>
			</div>
			<div class="settings-body">
				<div class="settings-row">
					<span class="settings-label">Theme</span>
					<button class="settings-btn" onclick={toggleTheme}>
						{darkMode ? 'LIGHT' : 'DARK'}
					</button>
				</div>

				<!-- Pinned Entities -->
				{#if persistedFavorites.entities.length > 0}
					<div class="settings-section">
						<div class="settings-section-label">PINNED ENTITIES</div>
						{#each persistedFavorites.entities as entity (entity.cik)}
							<div class="settings-favorite-row">
								<span class="settings-fav-name">{entity.name}</span>
								<span class="settings-fav-cik">{entity.cik}</span>
								<button class="settings-fav-add" onclick={() => quickAddEntity(entity)} title="Add to search">+</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Saved Groups -->
				{#if persistedFavorites.groups.length > 0}
					<div class="settings-section">
						<div class="settings-section-label">SAVED GROUPS</div>
						{#each persistedFavorites.groups as group (group.id)}
							<div class="settings-group-row">
								<span class="group-color-dot" style="background: {group.color}"></span>
								<span class="settings-group-name">{group.name} Entities ({group.entityCiks.length})</span>
								<button class="settings-fav-add" onclick={() => quickLoadGroup(group)} title="Load group">LOAD</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Recent History -->
				{#if (persistedFavorites.entityHistory ?? []).length > 0}
					<div class="settings-section">
						<div class="settings-section-label">RECENT</div>
						{#each (persistedFavorites.entityHistory ?? []).slice(0, 20) as entity (entity.cik)}
							<div class="settings-favorite-row">
								<span class="settings-fav-name">{entity.name}</span>
								<span class="settings-fav-cik">{entity.cik}</span>
								<button class="settings-fav-add" onclick={() => quickAddEntity(entity)} title="Add to search">+</button>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Clear all -->
				<div class="settings-row mt-sm">
					<span class="settings-label">Data</span>
					<button class="settings-btn settings-danger" onclick={clearAllData}>CLEAR ALL</button>
				</div>

				<!-- Clear localStorage -->
				<div class="settings-row">
					<span class="settings-label">Cache</span>
					<button class="settings-btn settings-danger" onclick={clearLocalStorage}>CLEAR CACHE</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="search-wrapper" class:top={searchActive}>
		{#if !searchActive}
			<div class="hero-title">SEC EDGAR x OIG</div>
			<div class="hero-subtitle">Entity Search + Exclusion Cross-Reference</div>
			<div class="hero-count">{data.totalEntities.toLocaleString()} entities indexed</div>
			<div class="hero-intro">
				Search any SEC-registered entity by name or CIK number. The tool pulls filings from EDGAR,
				extracts affiliated persons from signatures, officer lists, and narrative disclosures, then
				cross-references each name against the HHS OIG exclusion database (LEIE). Matched names link
				directly to the OIG verification page. Use <i class="fa-thin fa-thumbtack"></i> to pin names
				you want to keep across searches.
			</div>
		{:else}
			<div class="compact-info-wrapper">
				<div class="compact-info-trigger" role="button" tabindex="0" title="About this tool">
					<i class="fa-thin fa-circle-info"></i>
				</div>
				<div class="compact-info-popup">
					Search any SEC-registered entity by name or CIK number. The tool pulls filings from EDGAR,
					extracts affiliated persons from signatures, officer lists, and narrative disclosures, then
					cross-references each name against the HHS OIG exclusion database (LEIE). Matched names link
					directly to the OIG verification page. Use the pin icon to keep names across searches.
				</div>
			</div>
		{/if}

		<div class="search-box">
			<button
				class="mode-toggle"
				onclick={toggleSearchMode}
				title={searchMode === 'entity' ? 'Switch to person search' : 'Switch to entity search'}
				disabled={$isSearching}
			>
				{#if searchMode === 'entity'}
					<i class="fa-thin fa-building"></i>
				{:else}
					<i class="fa-thin fa-user"></i>
				{/if}
			</button>
			<div class="search-input-wrapper">
				{#if searchMode === 'entity'}
					{#each selectedEntities as entity (`${entity.cik}_${entity.name}`)}
						{@const entityKey = `${entity.cik}_${entity.name}`}
						{@const entityGroup = entityGroups.find(g => g.entityCiks.includes(entity.cik))}
						<span class="entity-badge-wrapper">
							<span class="entity-badge" style={entity.color ? `border-color: ${entity.color}; background: ${entity.color}20` : ''}>
								{entity.name} | {entity.cik}
								<button type="button" class="entity-pin-btn" class:pinned={entity.pinned}
									onclick={() => toggleEntityPin(entity.cik, entity.name)}
									onpointerdown={() => handlePinPointerDown(entityKey)}
									onpointerup={handlePinPointerUp}
									onpointerleave={handlePinPointerUp}
									aria-label={entity.pinned ? 'Unpin' : 'Pin'}
								><i class={entity.pinned ? 'fas fa-thumbtack' : 'fa-thin fa-thumbtack'}></i></button>
								<button type="button" class="remove" onclick={() => removeEntity(entity.cik, entity.name)} aria-label="Remove {entity.name}">x</button>
							</span>
							{#if colorPickerTarget === entityKey}
								<div class="color-picker-popup">
									{#each PASTEL_COLORS as color}
										<button type="button" class="color-swatch" style="background: {color}"
											onclick={() => setEntityColor(entity.cik, entity.name, color)}
											aria-label="Set color"></button>
									{/each}
									<button type="button" class="color-swatch color-swatch-clear"
										onclick={() => setEntityColor(entity.cik, entity.name, '')}
										aria-label="Clear color">x</button>
								</div>
							{/if}
							<span class="entity-hover-popup">
								<span class="hover-label">Entity</span>
								<span class="hover-value">{entity.name}</span>
								<span class="hover-label">CIK</span>
								<span class="hover-value">{entity.cik}</span>
								<span class="hover-label">EDGAR</span>
								<a class="hover-link" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={entity.cik}&type=&dateb=&owner=include&count=40" target="_blank" rel="noopener noreferrer">View on SEC EDGAR</a>
								{#if entityGroup}
									<span class="hover-label">Tag</span>
									<span class="hover-value">{entityGroup.name}</span>
								{/if}
							</span>
						</span>
					{/each}
					{#if selectedEntities.length >= 1}
						<button type="button" class="group-entities-btn"
							bind:this={groupBtnRef}
							onclick={() => groupPopupOpen = !groupPopupOpen}
							title="Group entities">
							<i class="fa-thin fa-layer-group"></i>
						</button>
						{#if groupPopupOpen}
							<div class="group-popup" bind:this={groupPopupRef}>
								{#if entityGroups.length > 0}
									<div class="group-section-label">ADD TO EXISTING</div>
									{#each entityGroups as group}
										<button type="button" class="group-item-clickable"
											onclick={() => addEntitiesToGroup(group.id)}>
											<span class="group-color-dot" style="background: {group.color}"></span>
											<span>{group.name} ({group.entityCiks.length})</span>
										</button>
									{/each}
									<div class="group-divider"></div>
								{/if}
								<div class="group-section-label">CREATE NEW</div>
								<input class="group-name-input"
									bind:this={groupInputRef}
									placeholder="Group tag..."
									bind:value={groupTagInput}
									onkeydown={(e) => { if (e.key === 'Enter') saveEntityGroup(); }} />
								<button class="group-save-btn" onclick={saveEntityGroup}>TAG</button>
							</div>
						{/if}
					{/if}
				{/if}
				{#if searchMode === 'person' || searchMode === 'individual'}
					{#each selectedPersons as person (person.fullName)}
						<span class="person-badge">
							{person.fullName}
							<button type="button" class="remove" onclick={() => removePerson(person.fullName)} aria-label="Remove {person.fullName}">x</button>
						</span>
					{/each}
				{/if}
				<input
					bind:this={inputEl}
					bind:value={query}
					oninput={searchMode === 'entity' ? onInput : undefined}
					onkeydown={onKeydown}
					onblur={searchMode === 'entity' ? onBlur : undefined}
					onfocus={() => { if (searchMode === 'entity' && query.length >= 2) onInput(); }}
					placeholder={searchMode === 'person'
						? (selectedPersons.length > 0 ? 'Add another person...' : 'Enter name (Last, First or First Last)...')
						: selectedEntities.length > 0 ? 'Add another entity or name...' : 'Search SEC entities by name or CIK...'}
				/>
			</div>
			{#if selectedEntities.length > 0 || selectedPersons.length > 0 || query.length > 0 || searchActive}
				<button class="clear-btn" onclick={clearSearch} title="Clear search">
					CLEAR
				</button>
			{/if}
			<button
				class="primary search-btn"
				onclick={startPipeline}
				disabled={$isSearching || (searchMode === 'entity' ? selectedEntities.length === 0 && query.trim().length === 0 : selectedPersons.length === 0)}
			>
				{$isSearching ? 'SEARCHING...' : 'SEARCH'}
			</button>
		</div>

		{#if searchMode === 'entity' && (dropdownVisible || loadingDropdown)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="dropdown search-dropdown"
				bind:this={dropdownEl}
				onmousedown={(e) => e.preventDefault()}
			>
				{#if loadingDropdown && dropdownResults.length === 0}
					<div class="dropdown-item loading">Loading...</div>
				{/if}
				{#each dropdownResults as result, i (`${result.cik}_${result.name}`)}
					<div
						class="dropdown-item"
						class:highlighted={i === highlightedIndex}
						onclick={() => selectEntity(result)}
						onmouseenter={() => { highlightedIndex = i; }}
						role="option"
						tabindex="-1"
						aria-selected={i === highlightedIndex}
					>
						<span class="entity-name">{result.name}</span>
						<span class="cik">({result.cik})</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#if searchActive || $extractedNames.some(n => n.pinned)}
		<div class="results container">
			<!-- Entity summary panel -->
			{#if searchActive && selectedEntities.length > 0}
				<div class="panel mt-lg">
					<div class="panel-header">ENTITIES</div>
					<div class="entity-summary-list">
						{#each selectedEntities as entity (`${entity.cik}_${entity.name}`)}
							<div class="entity-summary-row">
								<div class="entity-summary-left">
									<div class="entity-summary-name">
										<a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={entity.cik}&type=&dateb=&owner=include&count=40"
											target="_blank" rel="noopener noreferrer"
											class="entity-summary-link">{entity.name}</a>
										<span class="text-xs text-muted">{entity.cik}</span>
										{#if entity.tickers?.length}
											<span class="text-xs text-muted">({entity.tickers.join(', ')})</span>
										{/if}
									</div>
									{#if entity.earliestFiling}
										<div class="entity-summary-meta text-xs text-muted">
											{entity.earliestFiling} -- {entity.latestFiling}
											{#if entity.sicCode} | SIC {entity.sicCode}{/if}
											{#if entity.filingCount} | {entity.filingCount} filings{/if}
										</div>
									{/if}
									{#if entity.formTypes?.length}
										<div class="entity-summary-forms">
											{#each entity.formTypes as form}
												<span class="filing-badge">{form}</span>
											{/each}
										</div>
									{/if}
								</div>
								<div class="entity-summary-right">
									<button type="button"
										class="pin-btn" class:pinned={entity.pinned}
										onclick={() => toggleEntityPin(entity.cik, entity.name)}
										title={entity.pinned ? 'Unpin entity' : 'Pin to persist across sessions'}>
										<i class={entity.pinned ? 'fas fa-thumbtack' : 'fa-thin fa-thumbtack'}></i>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

						<!-- Extracted names panel -->
			{#if $extractedNames.length > 0}
				<div class="panel mt-lg">
					<div class="panel-header panel-header-flex">
						<span>Extracted Names - OIG Status</span>
						<div class="status-counts">
							{#if clearCount > 0}
								<span class="count-badge count-clear">{clearCount} CLEAR</span>
							{/if}
							{#if possibleCount > 0}
								<span class="count-badge count-possible">{possibleCount} POSSIBLE</span>
							{/if}
							{#if matchCount > 0}
								<span class="count-badge count-match">{matchCount} MATCH</span>
							{/if}
						</div>
					</div>
					<div class="names-list">
						{#each $extractedNames as entry (`${entry.name.firstName}_${entry.name.lastName}`)}
							{@const nameKey = `${entry.name.firstName}_${entry.name.lastName}`.toLowerCase()}
							<div class="name-row" class:match-row-highlight={entry.oigStatus === 'match'}>
								<div class="name-left">
									<div class="name-primary">
										<span class="name-hover-wrapper" tabindex="0" role="button">
											<a
												href={buildOIGVerifyUrl(entry.name.lastName, entry.name.firstName)}
												target="_blank"
												rel="noopener noreferrer"
												class="name-link"
												class:match-link={entry.oigStatus === 'match'}
											>{entry.name.fullName}</a>
											<span class="name-hover-popup">
												<span class="hover-label">Full Name</span>
												<span class="hover-value">{entry.name.fullName}</span>
												{#if entry.name.firstName}
													<span class="hover-label">First</span>
													<span class="hover-value">{entry.name.firstName}</span>
												{/if}
												{#if entry.name.middleName}
													<span class="hover-label">Middle</span>
													<span class="hover-value">{entry.name.middleName}</span>
												{/if}
												{#if entry.name.lastName}
													<span class="hover-label">Last</span>
													<span class="hover-value">{entry.name.lastName}</span>
												{/if}
												<span class="hover-label">Source</span>
												<span class="hover-value">{entry.source}</span>
												{#if entry.name.source && entry.name.source !== entry.source}
													<span class="hover-label">Pattern</span>
													<span class="hover-value">{entry.name.source}</span>
												{/if}
												{#if entry.filings && entry.filings.length > 0}
													<span class="hover-label">Filings</span>
													<span class="hover-value">{entry.filings.map(f => `${f.form} ${f.date}`).join(', ')}</span>
												{/if}
												{#if entry.oigMatches && entry.oigMatches.length > 0}
													<span class="hover-label">OIG Excl. Type</span>
													<span class="hover-value hover-match">{formatExclType(entry.oigMatches[0].exclType)}</span>
													<span class="hover-label">Excl. Date</span>
													<span class="hover-value">{formatOIGDate(entry.oigMatches[0].exclDate)}</span>
													{#if entry.oigMatches[0].npi}
														<span class="hover-label">NPI</span>
														<span class="hover-value">{entry.oigMatches[0].npi}</span>
													{/if}
												{/if}
											</span>
										</span>
									</div>
									<div class="name-source text-xs text-muted">{entry.source}</div>
								</div>
								<div class="name-right">
									<span class="badge {statusBadgeClass(entry.oigStatus)}">
										{statusLabel(entry.oigStatus, entry.oigMatches)}
									</span>
									{#if entry.oigStatus === 'clear' || entry.oigStatus === 'possible_match'}
										<a href={buildOIGVerifyUrl(entry.name.lastName, entry.name.firstName)}
											target="_blank" rel="noopener noreferrer"
											class="verify-icon-link" title="Verify on OIG">
											<i class="fa-thin fa-arrow-up-right-from-square"></i>
										</a>
									{/if}
									<!-- Filing badges -->
									{#if entry.filings && entry.filings.length > 0}
										<div class="filing-badges">
											{#each entry.filings as filing (filing.accession)}
												<button
													type="button"
													class="filing-badge"
													title="{filing.form} {filing.date}"
													onclick={() => openFilingPopup(filing.url, filing.form, filing.date)}
												>{filing.form}</button>
											{/each}
										</div>
									{/if}
									<!-- Pin -->
									<button
										type="button"
										class="pin-btn"
										class:pinned={entry.pinned}
										onclick={() => togglePin(nameKey)}
										title={entry.pinned ? 'Unpin name' : 'Pin name'}
									>
										<i class={entry.pinned ? 'fas fa-thumbtack' : 'fa-thin fa-thumbtack'}></i>
									</button>
								</div>
							</div>

							<!-- OIG match details (inline under matched name) -->
							{#if entry.oigMatches && entry.oigMatches.length > 0}
								{#each entry.oigMatches as match}
									{@const matchKey = `${entry.name.firstName}_${entry.name.lastName}_${match.exclType}`}
									{#if !dismissedMatches.has(matchKey)}
									<div class="oig-detail-header">
										<button class="oig-collapse-btn" onclick={() => toggleCollapseMatch(matchKey)} title="Toggle details">
											<i class={collapsedMatches.has(matchKey) ? 'fa-thin fa-caret-right' : 'fa-thin fa-caret-down'}></i>
										</button>
										<span class="oig-detail-title">{match.firstName} {match.lastName} -- {formatExclType(match.exclType)}</span>
										<button class="oig-dismiss-btn" onclick={() => dismissMatch(matchKey)} title="Dismiss">x</button>
									</div>
									{#if !collapsedMatches.has(matchKey)}
									<div class="oig-detail">
										<div class="oig-sections">
											<div class="oig-section">
												<div class="oig-section-label">Identity</div>
												<div class="oig-section-grid">
													<div class="oig-field">
														<span class="oig-label">Last Name</span>
														<span class="oig-value">{match.lastName}</span>
													</div>
													<div class="oig-field">
														<span class="oig-label">First Name</span>
														<span class="oig-value">{match.firstName}</span>
													</div>
													<div class="oig-field">
														<span class="oig-label">Middle</span>
														<span class="oig-value">{match.midName || '-'}</span>
													</div>
													<div class="oig-field">
														<span class="oig-label">DOB</span>
														<span class="oig-value">{formatOIGDate(match.dob) || 'Unknown'}</span>
													</div>
												</div>
											</div>
											<div class="oig-section">
												<div class="oig-section-label">Professional</div>
												<div class="oig-section-grid">
													<div class="oig-field">
														<span class="oig-label">NPI</span>
														<span class="oig-value">{match.npi || 'Unknown'}</span>
													</div>
													<div class="oig-field">
														<span class="oig-label">UPIN</span>
														<span class="oig-value">{match.upin || 'Unknown'}</span>
													</div>
													<div class="oig-field">
														<span class="oig-label">General</span>
														<span class="oig-value">{match.general || '-'}</span>
													</div>
													<div class="oig-field">
														<span class="oig-label">Specialty</span>
														<span class="oig-value">{match.specialty || '-'}</span>
													</div>
													{#if match.busName}
														<div class="oig-field oig-field-wide">
															<span class="oig-label">Business</span>
															<span class="oig-value">{match.busName}</span>
														</div>
													{/if}
												</div>
											</div>
											<div class="oig-section">
												<div class="oig-section-label">Location</div>
												<div class="oig-section-grid">
													<div class="oig-field oig-field-wide">
														<span class="oig-label">Address</span>
														<span class="oig-value oig-address">
															{match.address}{match.city ? `, ${match.city}` : ''}{match.state ? `, ${match.state}` : ''} {match.zip || ''}
														</span>
													</div>
												</div>
											</div>
											<div class="oig-section">
												<div class="oig-section-label">Exclusion</div>
												<div class="oig-section-grid">
													<div class="oig-field">
														<span class="oig-label">Type</span>
														<span class="oig-value oig-excl-type">{formatExclType(match.exclType)}</span>
													</div>
													<div class="oig-field">
														<span class="oig-label">Date</span>
														<span class="oig-value">{formatOIGDate(match.exclDate)}</span>
													</div>
													<div class="oig-field">
														<span class="oig-label">Reinstatement</span>
														<span class="oig-value">{formatOIGDate(match.reinDate) || 'None'}</span>
													</div>
													<div class="oig-field">
													{#if match.waiverDate && match.waiverDate !== '00000000'}
														<span class="oig-label">Waiver</span>
														<span class="oig-value">{formatOIGDate(match.waiverDate)} ({match.waiverState})</span>
													{:else}
														<span class="oig-label">Waiver</span>
														<span class="oig-value">-</span>
													{/if}
													</div>
												</div>
											</div>
										</div>
										<div class="oig-verify-link">
											<a
												href={buildOIGVerifyUrl(match.lastName, match.firstName)}
												target="_blank"
												rel="noopener noreferrer"
												title="Verify {match.lastName}, {match.firstName} on OIG"
											>Verify on OIG <i class="fa-thin fa-arrow-up-right-from-square"></i></a>
										</div>
									</div>
									{/if}
									{/if}
								{/each}
							{/if}
						{/each}
					</div>
				</div>
			{/if}

			<!-- Terminal log -->
			{#if $logLines.length > 0}
				<div class="panel mt-md mb-md">
					<div class="panel-header log-header">
						<span>Processing Log</span>
						<button type="button" class="expand-btn" onclick={() => { logExpanded = !logExpanded; }}>
							{logExpanded ? 'COLLAPSE' : 'EXPAND'}
						</button>
					</div>
					<div class="terminal-log" class:expanded={logExpanded} id="terminal-log">
						{#each $logLines as line, idx (idx + '_' + line.timestamp)}
							{#if line.url}
								<a href={line.url} target="_blank" rel="noopener noreferrer" class="log-line log-line-link {line.type}">
									<span class="log-time">[{formatTimestamp(line.timestamp)}]</span>
									{line.text}
									<i class="fa-thin fa-arrow-up-right-from-square log-link-icon"></i>
								</a>
							{:else}
								<div class="log-line {line.type}">
									<span class="log-time">[{formatTimestamp(line.timestamp)}]</span>
									{line.text}
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{/if}

			<!-- Detailed explainer -->
			<div class="panel mt-3x mb-lg explainer">
				<div class="panel-header">How It Works</div>
				<div class="explainer-content">
					<div class="explainer-section">
						<h4>Data Sources</h4>
						<p><strong>SEC EDGAR Entities</strong> -- {data.totalEntities.toLocaleString()} entities are indexed from the SEC EDGAR full company list, stored as alpha-bucketed JSON files (<code>cik_a.json</code> through <code>cik_z.json</code>, plus <code>cik_&#95;.json</code> for numeric/special). Each entry contains a company name and 10-digit CIK number. Fuzzy search runs client-side across loaded buckets for instant typeahead.</p>
						<p><strong>OIG LEIE Database</strong> -- The HHS Office of Inspector General List of Excluded Individuals/Entities (LEIE) is loaded from <code>UPDATED.csv</code>, the official monthly snapshot. Records are indexed server-side by normalized last+first name keys and by business name for O(1) lookup. Each record includes exclusion type, date, address, NPI, specialty, and reinstatement status.</p>
					</div>

					<div class="explainer-section">
						<h4>Filing Pipeline</h4>
						<p>When you search an entity, the tool fetches its submission history from the SEC EDGAR <code>/submissions/</code> API. Filings are prioritized by form type:</p>
						<ol>
							<li><strong>DEF 14A / PRE 14A</strong> -- Proxy statements (director/officer lists, compensation tables)</li>
							<li><strong>10-K / 10-KSB</strong> -- Annual reports (signatures, officer certifications, narrative disclosures)</li>
							<li><strong>10-Q / 10-QSB</strong> -- Quarterly reports (signature blocks, officer changes)</li>
							<li><strong>8-K</strong> -- Current reports (appointments, departures, material events)</li>
							<li><strong>S-1</strong> -- Registration statements (management bios, affiliated persons)</li>
						</ol>
						<p>Up to 20 filings are fetched and parsed for names. Each filing's HTML is stripped of tags and scanned with pattern-based extraction.</p>
					</div>

					<div class="explainer-section">
						<h4>Name Extraction Patterns</h4>
						<p>The name extractor applies 10 regex patterns to each filing document. Names must start with an uppercase letter, not appear in a blocklist of ~150 common words (titles, legal terms, financial jargon), and have both first and last name components between 2-30 characters.</p>
						<table class="explainer-table">
							<thead>
								<tr><th>#</th><th>Pattern</th><th>Example Match</th></tr>
							</thead>
							<tbody>
								<tr><td>1</td><td><code>/s/</code> signature blocks</td><td>/s/ John A. Smith</td></tr>
								<tr><td>2</td><td><code>By:</code> signature lines</td><td>By: /s/ Jane Doe</td></tr>
								<tr><td>3</td><td>Name, Title</td><td>Albert Bourla, Chief Executive Officer</td></tr>
								<tr><td>4</td><td>Title: Name</td><td>CEO: Albert Bourla</td></tr>
								<tr><td>5</td><td>SGML headers</td><td>FILED BY: John Smith</td></tr>
								<tr><td>6</td><td>Director/nominee lists</td><td>Jane Doe 58 2019</td></tr>
								<tr><td>7</td><td>Narrative context</td><td>Jane Doe has served as...</td></tr>
								<tr><td>8</td><td>Departures</td><td>Robert Spertell, resigned as...</td></tr>
								<tr><td>9</td><td>Role descriptions</td><td>Jane Doe, a director...</td></tr>
								<tr><td>10</td><td>Appointments</td><td>John Smith was appointed as...</td></tr>
							</tbody>
						</table>
					</div>

					<div class="explainer-section">
						<h4>OIG Cross-Reference</h4>
						<p>Extracted names are batched and checked against the OIG LEIE database. Matching uses normalized keys (lowercase, alphanumeric only). An <strong>exact match</strong> requires both last name and first name to match. A <strong>partial match</strong> triggers when the last name matches and first name is a prefix match (e.g., "Rob" matches "Robert"). Business names are also checked with substring matching.</p>
						<p>Results link to the OIG verification page via a server-side proxy that handles the ASP.NET WebForms ViewState/PostBack mechanism to submit the search form and return official results.</p>
					</div>

					<div class="explainer-section">
						<h4>Search Modes</h4>
						<p>Use the <i class="fa-thin fa-building"></i> / <i class="fa-thin fa-user"></i> toggle to switch between modes:</p>
						<ul>
							<li><strong>Entity mode</strong> (<i class="fa-thin fa-building"></i>) -- Search SEC-registered entities by name or CIK. Select one or more as badges, then hit SEARCH to pull filings, extract names, and check OIG.</li>
							<li><strong>Person mode</strong> (<i class="fa-thin fa-user"></i>) -- Search a person directly against the OIG exclusion database. Enter as "Last, First" or "First Last" -- the tool parses either format.</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	/* Top controls: settings gear + theme toggle */
	.top-controls {
		position: fixed;
		top: var(--spacing-lg);
		right: var(--spacing-lg);
		z-index: 200;
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}

	.settings-toggle {
		font-size: 1rem;
		padding: 0.25rem 0.5rem;
		background: none !important;
		border: none !important;
		box-shadow: none !important;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.settings-toggle:hover {
		color: var(--color-text);
		transform: none !important;
		box-shadow: none !important;
	}

	.settings-popup {
		position: fixed;
		top: calc(var(--spacing-lg) + 2.5rem);
		right: var(--spacing-lg);
		z-index: 200;
		min-width: 200px;
		background: var(--color-bg);
		border: 1px solid var(--color-border-dark);
		box-shadow: 3px 3px 0px var(--color-shadow);
	}

	.settings-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.settings-close {
		background: none !important;
		border: none !important;
		box-shadow: none !important;
		padding: 0.1rem 0.3rem !important;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.settings-close:hover {
		color: var(--color-text);
		transform: none !important;
		box-shadow: none !important;
	}

	.settings-body {
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.settings-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: 0;
		padding: 0.15rem 0;
	}

	.settings-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.settings-btn {
		font-size: 0.65rem !important;
		padding: 0.2rem 0.5rem !important;
	}

	.theme-toggle {
		font-size: 0.7rem;
		padding: 0.25rem 0.5rem;
	}

	.search-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		max-width: 700px;
		padding: 0 var(--spacing-lg);
		margin-top: 25vh;
		position: relative;
		transition: margin-top 0.3s ease, max-width 0.3s ease;
	}

	.search-wrapper.top {
		margin-top: var(--spacing-lg);
		max-width: 900px;
	}

	.mt-3x { margin-top: 4.5rem; }

	.hero-title {
		font-family: var(--font-mono);
		font-size: 1.75rem;
		font-weight: 600;
		margin-bottom: var(--spacing-xs);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.hero-subtitle {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		margin-bottom: 0.25rem;
	}

	.hero-count {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-md);
	}

	.hero-intro {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		line-height: 1.6;
		width: 100%;
		text-align: left;
		margin-bottom: var(--spacing-lg);
	}

	.hero-intro i {
		color: var(--color-text);
		font-size: 0.85em;
	}

	/* Entity badge hover popup */
	.entity-badge-wrapper {
		position: relative;
		display: inline-flex;
	}

	.entity-hover-popup {
		display: none;
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 160;
		min-width: 220px;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border-dark);
		box-shadow: 3px 3px 0px var(--color-shadow);
		pointer-events: none;
	}

	.entity-badge-wrapper:hover .entity-hover-popup {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.5rem;
		align-items: baseline;
	}

	/* Name hover popup */
	.name-hover-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.name-hover-popup {
		display: none;
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 160;
		min-width: 280px;
		max-width: 400px;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border-dark);
		box-shadow: 3px 3px 0px var(--color-shadow);
		pointer-events: none;
	}

	.name-hover-wrapper:hover .name-hover-popup {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.5rem;
		align-items: baseline;
	}

	/* Shared hover popup labels/values */
	.hover-label {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.hover-value {
		font-size: 0.78rem;
		color: var(--color-text);
		word-break: break-word;
	}

	.hover-value.hover-match {
		color: var(--color-error);
		font-weight: 600;
	}

	.hover-link {
		font-size: 0.75rem;
		color: var(--color-link);
		text-decoration: none;
	}

	.hover-link:hover { text-decoration: underline; }

	/* Compact info popup */
	.compact-info-wrapper {
		position: relative;
		align-self: flex-start;
		margin-bottom: var(--spacing-sm);
	}

	.compact-info-trigger {
		cursor: pointer;
		color: var(--color-text-muted);
		font-size: 1rem;
		padding: 0.15rem;
	}

	.compact-info-trigger:hover { color: var(--color-text); }

	.compact-info-popup {
		display: none;
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 150;
		width: 420px;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border: 1px solid var(--color-border-dark);
		box-shadow: 3px 3px 0px var(--color-shadow);
		font-size: 0.78rem;
		line-height: 1.6;
		color: var(--color-text-muted);
	}

	.compact-info-wrapper:hover .compact-info-popup,
	.compact-info-wrapper:focus-within .compact-info-popup {
		display: block;
	}

	/* Panel header with status counts */
	.panel-header-flex {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.status-counts {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}

	.count-badge {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.1rem 0.4rem;
		border-radius: 0;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.count-clear {
		background: #d4f5e9;
		color: #1a7a3a;
		border: 1px solid #a3e4c1;
	}

	.count-possible {
		background: #fff5c2;
		color: #92400e;
		border: 1px solid #fde68a;
	}

	.count-match {
		background: #ffc2c2;
		color: #b91c1c;
		border: 1px solid #f87171;
	}

	/* Search box */
	.search-box {
		display: flex;
		gap: 0;
		width: 100%;
		border: 1px solid var(--color-border-dark);
		box-shadow: 2px 2px 0px var(--color-shadow);
	}

	.search-input-wrapper {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.5rem;
		min-height: 2.5rem;
	}

	.search-input-wrapper input {
		flex: 1;
		min-width: 150px;
		border: none;
		outline: none;
		font-size: 0.9rem;
		padding: 0.25rem 0;
		background: transparent;
	}

	.search-input-wrapper input:focus { box-shadow: none; }

	.search-box button {
		border: none;
		border-left: 1px solid var(--color-border-dark);
		box-shadow: none;
		padding: 0.5rem 1rem;
		white-space: nowrap;
	}

	.search-box button:hover {
		box-shadow: none;
		transform: none;
		background: var(--color-hover-bg);
	}

	.search-box button.primary:hover { opacity: 0.85; }

	.clear-btn {
		font-size: 0.7rem !important;
		color: var(--color-text-muted) !important;
		letter-spacing: 0.05em;
	}

	/* Dropdown */
	.search-dropdown {
		width: 100%;
		left: 0;
		top: 100%;
		position: absolute;
		margin-top: -1px;
	}

	.dropdown-item.loading { color: var(--color-text-muted); font-style: italic; }
	.entity-name { font-weight: 600; }

	/* Results */
	.results { width: 100%; padding-top: var(--spacing-md); }

	/* Names list */
	.names-list { padding: 0; }

	.name-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 0.5rem var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		gap: var(--spacing-sm);
	}

	.name-row:last-child { border-bottom: none; }

	.match-row-highlight {
		background: rgba(220, 53, 69, 0.05);
	}

	.name-left { flex: 1; min-width: 0; }

	.name-primary {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.name-link {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--color-text);
		text-decoration: none;
	}

	.name-link:hover { text-decoration: underline; }

	.name-link.match-link { color: var(--color-error); }

	.verify-icon-link {
		color: var(--color-text-muted);
		font-size: 0.7rem;
		text-decoration: none;
		opacity: 0.5;
		transition: opacity 0.15s;
	}

	.verify-icon-link:hover {
		opacity: 1;
		text-decoration: none;
	}

	.name-source { margin-top: 0.15rem; }

	.name-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	/* Filing badges */
	.filing-badges {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.filing-badge {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--color-link);
		border-radius: 0;
		color: var(--color-link);
		text-decoration: none;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		background: rgba(0, 102, 204, 0.08);
	}

	.filing-badge:hover {
		background: rgba(0, 102, 204, 0.2);
		text-decoration: none;
	}

	/* Pin button */
	.pin-btn {
		background: none !important;
		border: none !important;
		box-shadow: none !important;
		padding: 0.2rem !important;
		color: var(--color-text-muted);
		opacity: 0.3;
		font-size: 0.85rem;
		cursor: pointer;
		transition: opacity 0.15s;
		text-transform: none !important;
		letter-spacing: 0 !important;
	}

	.pin-btn:hover {
		opacity: 0.7;
		transform: none !important;
		box-shadow: none !important;
	}

	.pin-btn.pinned {
		opacity: 1;
		color: var(--scheme-shell);
	}

	/* Entity pin button */
	.entity-pin-btn {
		background: none !important;
		border: none !important;
		box-shadow: none !important;
		padding: 0.15rem 0.25rem !important;
		color: var(--color-text-muted);
		opacity: 0.5;
		font-size: 0.65rem;
		cursor: pointer;
		text-transform: none !important;
		letter-spacing: 0 !important;
		flex-shrink: 0;
	}

	.entity-pin-btn:hover {
		opacity: 0.8;
		transform: none !important;
		box-shadow: none !important;
	}

	.entity-pin-btn.pinned {
		opacity: 1;
		color: var(--scheme-shell);
	}

	/* Color picker */
	.color-picker-popup {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 170;
		display: flex;
		gap: 0.25rem;
		padding: var(--spacing-xs);
		background: var(--color-bg);
		border: 1px solid var(--color-border-dark);
		box-shadow: 3px 3px 0px var(--color-shadow);
	}

	.color-swatch {
		width: 1.5rem;
		height: 1.5rem;
		border: 1px solid var(--color-border-dark) !important;
		box-shadow: none !important;
		padding: 0 !important;
		cursor: pointer;
		font-size: 0.6rem;
		display: flex;
		align-items: center;
		justify-content: center;
		text-transform: none !important;
		letter-spacing: 0 !important;
		min-height: auto;
	}

	.color-swatch:hover {
		transform: none !important;
		box-shadow: 1px 1px 0px var(--color-shadow) !important;
	}

	.color-swatch-clear {
		background: var(--color-bg) !important;
		color: var(--color-text-muted);
	}

	/* Group name input */
	.group-name-input {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.1rem 0.25rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		width: 80px;
		box-shadow: none;
	}

	.group-name-input:focus {
		border-color: var(--color-border-dark);
		box-shadow: none;
	}

	/* OIG detail card */
	.oig-detail {
		background: var(--color-bg-alt);
		border-top: 1px solid var(--color-border);
		padding: var(--spacing-sm) var(--spacing-md);
	}

	.oig-sections {
		display: flex;
		flex-direction: column;
	}

	.oig-section {
		padding-bottom: var(--spacing-xs);
		margin-bottom: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
	}

	.oig-section:last-child {
		border-bottom: none;
		margin-bottom: 0;
		padding-bottom: 0;
	}

	.oig-section-label {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
		margin-bottom: 0.2rem;
		opacity: 0.7;
	}

	.oig-section-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.35rem var(--spacing-lg);
	}

	.oig-field { display: flex; flex-direction: column; }

	.oig-field-wide { grid-column: 1 / -1; }

	.oig-label {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.oig-value {
		font-size: 0.85rem;
		font-weight: 400;
	}

	.oig-address {
		font-size: 0.7rem;
	}

	.oig-excl-type {
		color: var(--color-error);
		font-weight: 600;
	}

	.oig-verify-link {
		margin-top: var(--spacing-sm);
		padding-top: var(--spacing-xs);
		border-top: 1px solid var(--color-border);
	}

	.oig-verify-link a {
		font-size: 0.75rem;
		color: var(--color-link);
		text-decoration: none;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.oig-verify-link a:hover { text-decoration: underline; }

	/* C6: OIG detail collapse/dismiss header */
	.oig-detail-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 0.3rem var(--spacing-md);
		background: var(--color-bg-alt);
		border-top: 1px solid var(--color-border);
		font-size: 0.75rem;
	}

	.oig-detail-title {
		flex: 1;
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
	}

	.oig-collapse-btn,
	.oig-dismiss-btn {
		background: none !important;
		border: none !important;
		box-shadow: none !important;
		padding: 0.1rem 0.35rem !important;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		cursor: pointer;
		font-family: var(--font-mono);
		text-transform: none !important;
		letter-spacing: 0 !important;
	}

	.oig-collapse-btn:hover,
	.oig-dismiss-btn:hover {
		color: var(--color-text);
		transform: none !important;
		box-shadow: none !important;
	}

	/* C4: Entity grouping glyph */
	.group-entities-btn {
		background: none !important;
		border: none !important;
		box-shadow: none !important;
		padding: 0.2rem 0.4rem !important;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		cursor: pointer;
		text-transform: none !important;
		letter-spacing: 0 !important;
	}

	.group-entities-btn:hover {
		color: var(--scheme-shell);
		transform: none !important;
		box-shadow: none !important;
	}

	.group-popup {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 170;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border-dark);
		box-shadow: 3px 3px 0px var(--color-shadow);
		min-width: 180px;
	}

	.group-save-btn {
		font-size: 0.65rem !important;
		padding: 0.2rem 0.5rem !important;
	}

	.group-list {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		border-top: 1px solid var(--color-border);
		padding-top: var(--spacing-xs);
	}

	.group-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.72rem;
	}

	.group-section-label {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
		margin-bottom: 0.2rem;
	}

	.group-item-clickable {
		width: 100%;
		background: none !important;
		border: none !important;
		border-bottom: 1px solid var(--color-border) !important;
		box-shadow: none !important;
		padding: 0.35rem var(--spacing-xs) !important;
		text-align: left;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.72rem;
		text-transform: none !important;
		letter-spacing: 0 !important;
	}

	.group-item-clickable:hover {
		background: var(--color-hover-bg) !important;
		transform: none !important;
		box-shadow: none !important;
	}

	.group-divider {
		border-top: 1px solid var(--color-border);
		margin: var(--spacing-xs) 0;
	}

	.group-color-dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		display: inline-block;
		flex-shrink: 0;
	}

	/* Log */
	.log-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.expand-btn {
		font-size: 0.65rem !important;
		padding: 0.15rem 0.5rem !important;
		border: 1px solid var(--color-border) !important;
		background: none !important;
		box-shadow: none !important;
		color: var(--color-text-muted) !important;
	}

	.expand-btn:hover {
		background: var(--color-hover-bg) !important;
		transform: none !important;
		box-shadow: none !important;
	}

	:global(.terminal-log) { max-height: 400px; }
	:global(.terminal-log.expanded) { max-height: 800px; }

	.log-line-link {
		display: block;
		text-decoration: none;
		color: inherit;
		cursor: pointer;
	}

	.log-line-link:hover {
		background: var(--color-hover-bg);
		text-decoration: none;
	}

	.log-link-icon {
		font-size: 0.7em;
		opacity: 0;
		margin-left: 0.3rem;
		transition: opacity 0.15s;
	}

	.log-line-link:hover .log-link-icon { opacity: 0.6; }

	.log-time {
		color: var(--color-text-muted);
		font-size: 0.8em;
		margin-right: 0.5rem;
	}

	:global(#terminal-log) { scroll-behavior: smooth; }

	/* Mode toggle */
	.mode-toggle {
		border: none !important;
		border-right: 1px solid var(--color-border-dark) !important;
		border-left: none !important;
		box-shadow: none !important;
		padding: 0.5rem 0.75rem !important;
		font-size: 1rem;
		color: var(--color-text-muted);
		background: var(--color-bg-alt) !important;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.5rem;
	}

	.mode-toggle:hover {
		background: var(--color-hover-bg) !important;
		transform: none !important;
		box-shadow: none !important;
		color: var(--color-text);
	}

	.mode-toggle i { font-size: 1rem; }

	/* Explainer */
	.explainer-content {
		padding: var(--spacing-md);
	}

	.explainer-section {
		margin-bottom: var(--spacing-lg);
	}

	.explainer-section:last-child { margin-bottom: 0; }

	.explainer-section h4 {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--spacing-sm);
		color: var(--color-text);
	}

	.explainer-section p {
		font-size: 0.8rem;
		line-height: 1.6;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.explainer-section p:last-child { margin-bottom: 0; }

	.explainer-section strong {
		color: var(--color-text);
		font-weight: 600;
	}

	.explainer-section code {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		background: var(--color-bg-alt);
		padding: 0.1rem 0.3rem;
		border: 1px solid var(--color-border);
	}

	.explainer-section ol, .explainer-section ul {
		font-size: 0.8rem;
		line-height: 1.6;
		color: var(--color-text-muted);
		padding-left: 1.5rem;
		margin-bottom: var(--spacing-sm);
	}

	.explainer-section li { margin-bottom: 0.25rem; }
	.explainer-section li strong { color: var(--color-text); }

	.explainer-section i {
		font-size: 0.85em;
		color: var(--color-text);
	}

	.explainer-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.75rem;
		margin-top: var(--spacing-sm);
	}

	.explainer-table th {
		text-align: left;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid var(--color-border-dark);
	}

	.explainer-table td {
		padding: 0.3rem 0.5rem;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text-muted);
	}

	.explainer-table td:first-child {
		font-family: var(--font-mono);
		color: var(--color-text-muted);
		width: 2rem;
	}

	.explainer-table code {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		background: var(--color-bg-alt);
		padding: 0.05rem 0.2rem;
		border: 1px solid var(--color-border);
	}

	/* Touch-friendly targets */
	@media (pointer: coarse) {
		.theme-toggle { min-height: 44px; min-width: 44px; display: flex; align-items: center; justify-content: center; }
		.settings-toggle { min-height: 44px; min-width: 44px; display: flex !important; align-items: center; justify-content: center; }
		.oig-collapse-btn, .oig-dismiss-btn { min-height: 44px !important; min-width: 44px !important; display: flex !important; align-items: center; justify-content: center; }
		.mode-toggle { min-height: 44px !important; }
		.search-box button { min-height: 44px; }
		.search-input-wrapper input { min-height: 44px; }
		.pin-btn { min-width: 44px !important; min-height: 44px !important; display: flex !important; align-items: center; justify-content: center; }
		.entity-badge .remove { min-width: 32px !important; min-height: 32px !important; display: inline-flex !important; align-items: center; justify-content: center; box-sizing: border-box; }
		.oig-verify-link a { display: inline-flex; align-items: center; min-height: 44px; }
		.filing-badge { min-height: 44px; display: inline-flex; align-items: center; }
		.expand-btn { min-height: 44px !important; display: inline-flex !important; align-items: center; }
		.name-hover-wrapper { min-height: 44px; display: inline-flex; align-items: center; }
		.color-swatch { min-width: 44px !important; min-height: 44px !important; width: 44px; height: 44px; }
		.entity-pin-btn { min-width: 44px !important; min-height: 44px !important; display: flex !important; align-items: center; justify-content: center; }
	}

	/* --- Tablet: 769px - 1024px --- */
	@media (max-width: 1024px) {
		.top-controls { top: var(--spacing-lg); right: var(--spacing-lg); }
		.oig-section-grid { grid-template-columns: repeat(2, 1fr); gap: 0.35rem var(--spacing-md); }
		.oig-detail { padding-left: var(--spacing-md); }
	}

	/* --- Mobile / small tablet: <= 768px --- */
	@media (max-width: 768px) {
		.search-wrapper { margin-top: 15vh; padding: 0 var(--spacing-md); }
		.search-wrapper.top { max-width: 100%; padding: 0 var(--spacing-sm); }
		.top-controls { top: var(--spacing-sm); right: var(--spacing-sm); }
		.theme-toggle { font-size: 0.6rem; padding: 0.2rem 0.4rem; }
		.settings-toggle { font-size: 0.85rem; }
		.settings-popup { top: calc(var(--spacing-sm) + 2.5rem); right: var(--spacing-sm); }
		.hero-title { font-size: 1.25rem; }
		.hero-subtitle { font-size: 0.75rem; }
		.hero-intro { font-size: 0.75rem; line-height: 1.5; }

		/* Search box stacks vertically */
		.search-box { flex-direction: column; }
		.search-box button { border-left: none; border-top: 1px solid var(--color-border-dark); }
		.mode-toggle {
			border-right: none !important;
			border-bottom: 1px solid var(--color-border-dark) !important;
			order: -1;
			padding: 0.4rem 0.75rem !important;
		}
		.search-input-wrapper { padding: 0.4rem 0.5rem; }
		.search-box .search-btn { padding: 0.6rem 1rem; }
		.search-box .clear-btn { padding: 0.4rem 0.75rem; }

		/* Entity badges wrap and shrink */
		.entity-badge { font-size: 0.65rem; padding: 0.15rem 0.4rem; }
		.entity-badge .remove { font-size: 0.6rem; }

		/* OIG detail grid two columns at tablet width */
		.oig-section-grid { grid-template-columns: repeat(2, 1fr); gap: 0.3rem var(--spacing-md); }
		.oig-detail { padding: var(--spacing-sm); }

		/* Name rows stack */
		.name-row { flex-direction: column; gap: var(--spacing-xs); padding: var(--spacing-sm); }
		.name-left { width: 100%; }
		.name-primary { flex-wrap: wrap; gap: 0.35rem; }
		.name-right {
			width: 100%;
			justify-content: space-between;
			flex-direction: row-reverse;
			padding-top: 0.25rem;
		}

		/* Filing badges wrap */
		.filing-badges { flex-wrap: wrap; gap: 0.2rem; }
		.filing-badge { font-size: 0.6rem; padding: 0.1rem 0.25rem; }

		/* Explainer table scrollable */
		.explainer-table { font-size: 0.7rem; display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
		.explainer-content { padding: var(--spacing-sm); }
		.explainer-section p, .explainer-section ol, .explainer-section ul { font-size: 0.75rem; }

		/* Info popup */
		.compact-info-popup { width: 280px; font-size: 0.72rem; }

		/* Panel header wraps */
		.panel-header-flex { flex-direction: column; align-items: flex-start; gap: 0.3rem; }
		.status-counts { flex-wrap: wrap; }

		/* Hover popups - show on tap for touch */
		.name-hover-popup, .entity-hover-popup { max-width: calc(100vw - 2rem); }

		/* Reduce large margins */
		.mt-3x { margin-top: var(--spacing-xl); }

		/* Entity summary responsive */
		.entity-summary-row { flex-direction: column; gap: var(--spacing-xs); }
		.entity-summary-right { width: 100%; justify-content: flex-end; }
		.entity-summary-meta { font-size: 0.6rem; }
		.entity-summary-link { font-size: 0.8rem; }
		.entity-summary-forms .filing-badge { font-size: 0.55rem; padding: 0.05rem 0.2rem; }

		/* Name sizing hierarchy */
		.name-link { font-size: 0.85rem; }
		.filing-badge { font-size: 0.55rem; }

		/* Settings buttons consistent sizing */
		.settings-btn {
			font-size: 0.65rem !important;
			padding: 0.2rem 0.5rem !important;
		}

		/* Results container */
		.results { padding-top: var(--spacing-sm); }
	}

	/* --- Small phone: <= 480px --- */
	@media (max-width: 480px) {
		.search-wrapper { margin-top: 10vh; padding: 0 var(--spacing-xs); }
		.search-wrapper.top { padding: 0 var(--spacing-xs); }
		.hero-title { font-size: 1.1rem; letter-spacing: 0.05em; }
		.hero-subtitle { font-size: 0.7rem; }
		.hero-count { font-size: 0.65rem; }
		.hero-intro { font-size: 0.7rem; line-height: 1.45; margin-bottom: var(--spacing-md); }

		/* Compact name display */
		.name-link { font-size: 0.82rem; font-weight: 700; }
		.name-source { font-size: 0.65rem; }
		.oig-label { font-size: 0.6rem; }
		.oig-value { font-size: 0.78rem; }
		.oig-address { font-size: 0.6rem; word-break: break-word; }
		.entity-summary-meta { font-size: 0.55rem; }
		.entity-summary-link { font-size: 0.75rem; }
		.filing-badge { font-size: 0.5rem; padding: 0.05rem 0.2rem; }
		.oig-verify-link a { font-size: 0.7rem; }
		.oig-detail { padding: var(--spacing-xs) var(--spacing-sm); }

		/* OIG detail grid single column at small phone */
		.oig-section-grid { grid-template-columns: repeat(2, 1fr); gap: 0.25rem var(--spacing-sm); }

		/* Even smaller entity badges */
		.entity-badge { font-size: 0.6rem; padding: 0.1rem 0.3rem; line-height: 1.2; max-width: calc(100vw - 4rem); }

		/* Dropdown items more compact */
		.search-dropdown .dropdown-item { padding: 0.4rem 0.5rem; font-size: 0.78rem; }

		/* Explainer tighter */
		.explainer-section h4 { font-size: 0.72rem; }
		.explainer-section p, .explainer-section li { font-size: 0.7rem; line-height: 1.5; }
		.explainer-table th, .explainer-table td { padding: 0.25rem 0.35rem; font-size: 0.65rem; }
		.explainer-table code { font-size: 0.6rem; }

		/* Settings buttons consistent sizing */
		.settings-btn {
			font-size: 0.65rem !important;
			padding: 0.2rem 0.5rem !important;
			min-height: auto !important;
		}
		.settings-row { gap: var(--spacing-xs); }

		/* Panel adjustments */
		.name-row { padding: var(--spacing-xs) var(--spacing-sm); }

		/* Count badges smaller */
		.count-badge { font-size: 0.55rem; padding: 0.1rem 0.3rem; }

		/* Popups constrained */
		.name-hover-popup, .entity-hover-popup, .compact-info-popup {
			max-width: calc(100vw - 1.5rem);
			width: auto;
			min-width: 200px;
		}
		.compact-info-popup { left: -0.5rem; width: calc(100vw - 2rem); }
	}
	/* Settings panel sections */
	.settings-popup { min-width: 280px; max-height: 80vh; overflow-y: auto; }
	.settings-section { margin-top: var(--spacing-xs); padding-top: var(--spacing-xs); border-top: 1px solid var(--color-border); }
	.settings-section-label { font-size: 0.6rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); margin-bottom: 0.35rem; }
	.settings-favorite-row { display: flex; align-items: center; gap: 0.35rem; padding: 0.1rem 0; font-size: 0.72rem; }
	.settings-fav-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
	.settings-fav-cik { color: var(--color-text-muted); font-family: var(--font-mono); font-size: 0.65rem; }
	.settings-fav-add { background: none !important; border: none !important; box-shadow: none !important; padding: 0.1rem 0.3rem !important; font-size: 0.7rem; color: var(--color-text-muted); cursor: pointer; font-family: var(--font-mono); text-transform: none !important; letter-spacing: 0 !important; }
	.settings-fav-add:hover { color: var(--color-text); transform: none !important; box-shadow: none !important; }
	.settings-group-row { display: flex; align-items: center; gap: 0.35rem; padding: 0.1rem 0; font-size: 0.72rem; }
	.settings-group-name { flex: 1; font-weight: 600; }
	.settings-danger { color: var(--color-error) !important; border-color: var(--color-error) !important; }
	.mt-sm { margin-top: var(--spacing-sm); }

	/* Entity summary panel */
	.entity-summary-list { padding: 0; }
	.entity-summary-row {
		display: flex; align-items: flex-start; justify-content: space-between;
		padding: 0.5rem var(--spacing-md); border-bottom: 1px solid var(--color-border); gap: var(--spacing-sm);
	}
	.entity-summary-row:last-child { border-bottom: none; }
	.entity-summary-left { flex: 1; min-width: 0; }
	.entity-summary-name { display: flex; align-items: baseline; gap: var(--spacing-sm); flex-wrap: wrap; }
	.entity-summary-link { font-weight: 600; font-size: 0.9rem; color: var(--color-text); text-decoration: none; }
	.entity-summary-link:hover { text-decoration: underline; }
	.entity-summary-meta { margin-top: 0.15rem; }
	.entity-summary-forms { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.3rem; }
	.entity-summary-right { display: flex; align-items: center; gap: var(--spacing-sm); flex-shrink: 0; }

</style>
