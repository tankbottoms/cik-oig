import { chromium } from 'playwright';
import fs from 'fs';

const TEST_URL = 'http://localhost:4173';
const TEST_ENTITIES = [
  { name: 'Microsoft', cik: '0000789019' },
  { name: 'Apple', cik: '0000320193' },
  { name: 'Google', cik: '0001652044' },
  { name: 'Amazon', cik: '0001018724' },
  { name: 'Meta', cik: '0001326801' },
];

let testLog = [];

function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${type}: ${message}`;
  console.log(entry);
  testLog.push(entry);
}

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    log('Starting 4th Entity Bug Test');

    // Clear localStorage
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    log('Cleared localStorage');

    // Navigate to page
    await page.goto(TEST_URL);
    log(`Navigated to ${TEST_URL}`);

    // Wait for page to be interactive
    await page.waitForLoadState('networkidle');
    log('Page loaded');

    // Test adding entities one by one
    for (let i = 0; i < TEST_ENTITIES.length; i++) {
      const entity = TEST_ENTITIES[i];
      log(`\n=== TESTING ENTITY ${i + 1}: ${entity.name} ===`);

      try {
        // Find the search input
        const input = await page.locator('input[placeholder*="Add another entity"]').first();

        // Type entity name
        log(`Typing entity name: ${entity.name}`);
        await input.fill(entity.name);
        await page.waitForTimeout(500);

        // Check if suggestions appear
        const suggestionCount = await page.locator('div[role="option"]').count();
        log(`Found ${suggestionCount} suggestions`);

        // Wait a bit and take screenshot before clicking
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `/tmp/entity-${i + 1}-before-click.png` });

        // Click first suggestion
        const firstSuggestion = page.locator('div[role="option"]').first();
        const isVisible = await firstSuggestion.isVisible().catch(() => false);
        if (isVisible) {
          log(`Clicking first suggestion for ${entity.name}`);
          await firstSuggestion.click();
          await page.waitForTimeout(1000);
        } else {
          log(`WARNING: No visible suggestions for ${entity.name}`);
        }

        // Take screenshot after adding
        await page.screenshot({ path: `/tmp/entity-${i + 1}-added.png` });

        // Check page state
        const badges = await page.locator('.entity-badge-wrapper').count();
        log(`Entity badges on page: ${badges}`);

        // Check if UI is responsive by trying to interact with elements
        const settingsBtn = page.locator('.settings-toggle');
        const settingsBtnVisible = await settingsBtn.isVisible().catch(() => false);
        log(`Settings button visible: ${settingsBtnVisible}`);

        // Check localStorage state
        const localStorage = await page.evaluate(() => {
          const favs = localStorage.getItem('cik-oig-favorites');
          if (favs) {
            const parsed = JSON.parse(favs);
            return {
              entityCount: parsed.entities?.length || 0,
              groupCount: parsed.groups?.length || 0,
              settingsInfo: parsed.settings ? 'present' : 'missing'
            };
          }
          return { error: 'No localStorage data' };
        });
        log(`LocalStorage state: ${JSON.stringify(localStorage)}`);

      } catch (error) {
        log(`ERROR adding entity ${i + 1}: ${error.message}`, 'ERROR');

        // Take error screenshot
        await page.screenshot({ path: `/tmp/entity-${i + 1}-error.png` });

        // Check if page is still responsive
        const searchInput = await page.locator('input[placeholder*="Add another entity"]').isVisible().catch(() => false);
        if (!searchInput) {
          log(`CRITICAL: Search input not visible - UI may be frozen!`, 'CRITICAL');
          await page.screenshot({ path: `/tmp/entity-${i + 1}-frozen.png` });
          break;
        }
      }

      await page.waitForTimeout(1500);
    }

    log('\n=== Test Complete ===');

    // Final state check
    const finalState = await page.evaluate(() => {
      return {
        badgeCount: document.querySelectorAll('.entity-badge-wrapper').length,
        htmlLength: document.body.innerHTML.length,
        title: document.title
      };
    });
    log(`Final state: ${JSON.stringify(finalState)}`);

  } catch (error) {
    log(`Fatal error during test: ${error.message}`, 'FATAL');
    log(`Stack: ${error.stack}`, 'FATAL');
  } finally {
    await browser.close();

    // Save test log
    fs.writeFileSync('/tmp/test-log.txt', testLog.join('\n'));
    log('\nTest log saved to /tmp/test-log.txt');
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
