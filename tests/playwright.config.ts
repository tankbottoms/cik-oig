import { defineConfig, devices } from '@playwright/test';

// Dedicated ports for testing -- avoids collisions with other dev servers
const DEV_PORT = 5188;
const PROD_PORT = 4188;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: [['html', { open: 'never' }], ['list']],
	timeout: 120_000,
	expect: { timeout: 10_000 },

	use: {
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		// Use Chromium for all projects (only browser installed)
		browserName: 'chromium',
	},

	projects: [
		// Dev server projects
		{
			name: 'dev-desktop',
			use: {
				baseURL: `http://localhost:${DEV_PORT}`,
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: 'dev-tablet',
			use: {
				baseURL: `http://localhost:${DEV_PORT}`,
				viewport: { width: 820, height: 1180 },
				isMobile: true,
				hasTouch: true,
				userAgent: devices['iPad (gen 7)'].userAgent,
			},
		},
		{
			name: 'dev-phone',
			use: {
				baseURL: `http://localhost:${DEV_PORT}`,
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true,
				userAgent: devices['iPhone 13'].userAgent,
			},
		},

		// Production build projects
		{
			name: 'prod-desktop',
			use: {
				baseURL: `http://localhost:${PROD_PORT}`,
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: 'prod-tablet',
			use: {
				baseURL: `http://localhost:${PROD_PORT}`,
				viewport: { width: 820, height: 1180 },
				isMobile: true,
				hasTouch: true,
				userAgent: devices['iPad (gen 7)'].userAgent,
			},
		},
		{
			name: 'prod-phone',
			use: {
				baseURL: `http://localhost:${PROD_PORT}`,
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true,
				userAgent: devices['iPhone 13'].userAgent,
			},
		},
	],

	webServer: [
		{
			command: `npx vite dev --port ${DEV_PORT}`,
			port: DEV_PORT,
			reuseExistingServer: true,
			timeout: 30_000,
			cwd: '..',
		},
		{
			command: `npx vite build && npx vite preview --port ${PROD_PORT}`,
			port: PROD_PORT,
			reuseExistingServer: true,
			timeout: 120_000,
			cwd: '..',
		},
	],
});
