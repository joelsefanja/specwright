/**
 * Step Definition Helper Functions
 * Provides reusable utilities for BDD step implementations with data tables.
 *
 * Core exports:
 * - FIELD_TYPES       — declarative field type constants
 * - processDataTable  — fills forms from Gherkin 3-column data tables
 * - validateExpectations — asserts displayed values from data tables
 * - fillFieldByName   — fill a single field using selector priority hierarchy
 * - selectDropdown    — select option from a native or ARIA-compliant dropdown
 */

import { expect } from '@playwright/test';
import { generateValueForField } from './testDataGenerator.js';

// Simple replacements for lodash — avoids a dependency for 2 functions
const snakeCase = (str) => str.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s\-]+/g, '_').toLowerCase();
const kebabCase = (str) => str.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();

// ─────────────────────────────────────────────────────────────
// FIELD_TYPES — declarative type constants
// ─────────────────────────────────────────────────────────────
export const FIELD_TYPES = {
  // Interaction types (used in processDataTable fieldConfig)
  FILL: 'FILL',                       // plain text input
  FILL_AND_ENTER: 'FILL_AND_ENTER',   // fill then press Enter (tags, chips)
  DROPDOWN: 'DROPDOWN',               // native <select> or ARIA combobox
  CLICK: 'CLICK',                     // button / toggle via click
  CHECKBOX_TOGGLE: 'CHECKBOX_TOGGLE', // checkbox by label text
  TOGGLE: 'TOGGLE',                   // boolean toggle switch
  CUSTOM: 'CUSTOM',                   // write a fieldHandler for truly unique interactions

  // Validation types (used in validateExpectations validationConfig)
  INPUT_VALUE: 'INPUT_VALUE',         // assert text input .value (toHaveValue)
  DROPDOWN_VALUE: 'DROPDOWN_VALUE',   // assert selected option text
  TEXT_VISIBLE: 'TEXT_VISIBLE',       // assert text is visible by testID
};

// ─────────────────────────────────────────────────────────────
// processDataTable — fills forms from 3-column Gherkin data tables
// ─────────────────────────────────────────────────────────────

/**
 * Process a 3-column Gherkin data table (Field Name | Value | Type)
 * and interact with each field based on its FIELD_TYPE configuration.
 *
 * Handles:
 * - <gen_test_data> → generates faker value, caches in featureDataCache
 * - <from_test_data> → reads previously cached value
 * - Static values → uses as-is
 *
 * @param {Page} page - Playwright page
 * @param {DataTable} dataTable - Gherkin data table
 * @param {Object} config
 * @param {Object} config.mapping - Field name → page.testData property name
 * @param {Object} config.fieldConfig - Field name → { type: FIELD_TYPES.*, testID?, selector?, ... }
 * @param {Object} config.fieldHandlers - Field name → async (page, value) => {} for CUSTOM types
 * @param {Locator|Page} config.container - Scope all locators to this element (default: page)
 */
export async function processDataTable(page, dataTable, config = {}) {
  const { mapping = {}, fieldConfig = {}, fieldHandlers = {}, container = page } = config;

  const rows = dataTable.hashes();

  for (const row of rows) {
    const fieldName = row['Field Name'] || row['Field'] || row['Name'];
    const valueType = (row['Type'] || 'Static').toLowerCase();
    let value = row['Value'] || row['Expected Value'] || '';

    // ── Step 1: Resolve value from placeholder ──
    if (value === '<gen_test_data>') {
      if (mapping[fieldName] && page.testData?.[mapping[fieldName]] !== undefined) {
        value = page.testData[mapping[fieldName]];
      } else {
        value = generateValueForField(fieldName);
      }
      // Cache SharedGenerated values for later <from_test_data> reads
      if (valueType === 'sharedgenerated') {
        const cacheKey = mapping[fieldName] || snakeCase(fieldName);
        if (!page.testData) page.testData = {};
        page.testData[cacheKey] = value;
        const featureKey = getFeatureKey(page);
        if (featureKey) {
          if (!globalThis.__rt_featureDataCache) globalThis.__rt_featureDataCache = {};
          if (!globalThis.__rt_featureDataCache[featureKey]) globalThis.__rt_featureDataCache[featureKey] = {};
          globalThis.__rt_featureDataCache[featureKey][cacheKey] = value;
        }
        console.log(`🎲 Generated "${fieldName}" → ${cacheKey}: ${value}`);
      }
    } else if (value === '<from_test_data>') {
      const cacheKey = mapping[fieldName] || snakeCase(fieldName);
      if (page.testData?.[cacheKey] !== undefined) {
        value = page.testData[cacheKey];
        console.log(`📖 Read "${fieldName}" → ${cacheKey}: ${value}`);
      } else {
        const featureKey = getFeatureKey(page);
        const cached = featureKey && globalThis.__rt_featureDataCache?.[featureKey]?.[cacheKey];
        if (cached) {
          value = cached;
          console.log(`📖 Read from cache "${fieldName}" → ${cacheKey}: ${value}`);
        } else {
          console.warn(`⚠️ No cached value for "${fieldName}" (key: ${cacheKey})`);
        }
      }
    }

    // ── Step 2: Interact with the field ──
    if (fieldHandlers[fieldName]) {
      await fieldHandlers[fieldName](page, value);
    } else if (fieldConfig[fieldName]) {
      await executeFieldInteraction(page, fieldName, value, fieldConfig[fieldName], container);
    } else {
      await fillFieldByName(container, fieldName, value);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// validateExpectations — asserts displayed values from data tables
// ─────────────────────────────────────────────────────────────

/**
 * Validate displayed values from a 3-column Gherkin data table.
 * Reads <from_test_data> from page.testData or featureDataCache.
 */
export async function validateExpectations(page, dataTable, config = {}) {
  const { mapping = {}, validationConfig = {}, container = page } = config;

  const rows = dataTable.hashes();

  for (const row of rows) {
    const fieldName = row['Field Name'] || row['Field'] || row['Element'];
    let expectedValue = row['Expected Value'] || row['Value'] || '';

    if (expectedValue === '<from_test_data>') {
      const cacheKey = mapping[fieldName] || snakeCase(fieldName);
      if (page.testData?.[cacheKey] !== undefined) {
        expectedValue = page.testData[cacheKey];
        console.log(`✅ Validate "${fieldName}" → ${cacheKey}: ${expectedValue}`);
      } else {
        const featureKey = getFeatureKey(page);
        const cached = featureKey && globalThis.__rt_featureDataCache?.[featureKey]?.[cacheKey];
        if (cached) {
          expectedValue = cached;
          console.log(`✅ Validate from cache "${fieldName}" → ${cacheKey}: ${expectedValue}`);
        } else {
          throw new Error(
            `No cached value for "${fieldName}" (key: ${cacheKey}). Was <gen_test_data> used in a prior fill step?`,
          );
        }
      }
    }

    const vConfig = validationConfig[fieldName];
    if (vConfig) {
      await executeValidation(page, fieldName, expectedValue, vConfig, container);
    } else {
      await expect(page.getByText(expectedValue, { exact: false }).first()).toBeVisible();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// fillFieldByName — fill a single field using selector priority
// ─────────────────────────────────────────────────────────────

/**
 * Fill a field using Playwright's selector priority hierarchy.
 * Tries: testID → name attr → placeholder → label → role
 */
export async function fillFieldByName(container, fieldName, value) {
  const fieldKebab = kebabCase(fieldName);

  const strategies = [
    () => container.getByTestId(fieldKebab),
    () => container.getByTestId(`input-${fieldKebab}`),
    () => container.locator(`input[name="${fieldName}"]`),
    () => container.locator(`input[name="${fieldKebab}"]`),
    () => container.getByPlaceholder(new RegExp(fieldName, 'i')),
    () => container.getByLabel(fieldName),
    () => container.getByRole('textbox', { name: fieldName }),
  ];

  for (const getLocator of strategies) {
    try {
      const element = getLocator();
      if ((await element.count()) > 0) {
        const target = (await element.count()) > 1 ? element.first() : element;
        await target.fill(value);
        return;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Could not find field "${fieldName}" using any selector strategy.`);
}

// ─────────────────────────────────────────────────────────────
// selectDropdown — select option from native or ARIA dropdown
// ─────────────────────────────────────────────────────────────

/**
 * Select an option from a dropdown using standard Playwright methods.
 * Works with native <select>, ARIA combobox (role="combobox"), or listbox patterns.
 *
 * Priority: testID → role="combobox" → <select> by name → label
 */
export async function selectDropdown(container, fieldName, value) {
  const fieldKebab = kebabCase(fieldName);

  // 1. Try native <select> by testID
  const selectByTestId = container.getByTestId(fieldKebab);
  if ((await selectByTestId.count()) > 0) {
    const tag = await selectByTestId.evaluate((el) => el.tagName.toLowerCase());
    if (tag === 'select') {
      await selectByTestId.selectOption({ label: value });
      return;
    }
  }

  // 2. Try ARIA combobox pattern (role="combobox")
  const combobox = container.getByRole('combobox', { name: new RegExp(fieldName, 'i') });
  if ((await combobox.count()) > 0) {
    await combobox.click();
    const option = container.getByRole('option', { name: value });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
    return;
  }

  // 3. Try native <select> by name attribute
  const selectByName = container.locator(`select[name="${fieldName}"], select[name="${fieldKebab}"]`);
  if ((await selectByName.count()) > 0) {
    await selectByName.first().selectOption({ label: value });
    return;
  }

  // 4. Try <select> by label
  const selectByLabel = container.getByLabel(fieldName);
  if ((await selectByLabel.count()) > 0) {
    const tag = await selectByLabel.evaluate((el) => el.tagName.toLowerCase());
    if (tag === 'select') {
      await selectByLabel.selectOption({ label: value });
      return;
    }
  }

  throw new Error(`Could not find dropdown "${fieldName}". Supports: <select>, role="combobox", or ARIA listbox.`);
}

// ─────────────────────────────────────────────────────────────
// Internal: executeFieldInteraction
// ─────────────────────────────────────────────────────────────

async function executeFieldInteraction(page, fieldName, value, config, container = page) {
  switch (config.type) {
    case FIELD_TYPES.FILL:
      if (config.testID) {
        const el = container.getByTestId(config.testID);
        const count = await el.count();
        await (count > 1 ? el.first() : el).fill(value);
      } else if (config.selector) {
        await container.locator(config.selector).fill(value);
      } else if (config.placeholder) {
        await container.getByPlaceholder(config.placeholder).fill(value);
      } else {
        await fillFieldByName(container, fieldName, value);
      }
      break;

    case FIELD_TYPES.FILL_AND_ENTER: {
      const input = container.getByRole(config.role || 'textbox', {
        name: config.name || fieldName,
      });
      await input.fill(value);
      await input.press('Enter');
      break;
    }

    case FIELD_TYPES.DROPDOWN:
      if (config.testID) {
        // Try native <select> first, then ARIA combobox
        const el = container.getByTestId(config.testID);
        const tag = await el.evaluate((node) => node.tagName.toLowerCase()).catch(() => '');
        if (tag === 'select') {
          await el.selectOption({ label: value });
        } else {
          // ARIA combobox: click to open, then select option
          await el.click();
          const option = page.getByRole('option', { name: value });
          await option.waitFor({ state: 'visible', timeout: 5000 });
          await option.click();
        }
      } else {
        await selectDropdown(container, fieldName, value);
      }
      break;

    case FIELD_TYPES.CLICK:
      if (config.testID) {
        await container.getByTestId(config.testID).click();
      } else if (config.selector) {
        await container.locator(config.selector).click();
      } else if (config.role) {
        await container.getByRole(config.role, { name: config.name || value }).click();
      } else {
        await container.getByText(value).click();
      }
      break;

    case FIELD_TYPES.CHECKBOX_TOGGLE:
      if (config.testID) {
        await container.getByTestId(config.testID).click();
      } else {
        await container.getByRole('checkbox', { name: new RegExp(fieldName, 'i') }).click();
      }
      break;

    case FIELD_TYPES.TOGGLE:
      if (config.testID) {
        await container.getByTestId(config.testID).click();
      } else if (config.selector) {
        await container.locator(config.selector).click();
      } else {
        await container.getByRole('switch', { name: new RegExp(fieldName, 'i') }).click();
      }
      break;

    case FIELD_TYPES.CUSTOM:
      console.warn(`CUSTOM field "${fieldName}" requires a fieldHandler. Skipping.`);
      break;

    default:
      if (config.testID) {
        await container.getByTestId(config.testID).fill(value);
      } else {
        await fillFieldByName(container, fieldName, value);
      }
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// Internal: executeValidation
// ─────────────────────────────────────────────────────────────

async function executeValidation(page, fieldName, expectedValue, config, container = page) {
  switch (config.type) {
    case FIELD_TYPES.INPUT_VALUE:
      if (config.testID) {
        await expect(container.getByTestId(config.testID)).toHaveValue(expectedValue, { timeout: 5000 });
      } else if (config.selector) {
        await expect(container.locator(config.selector)).toHaveValue(expectedValue, { timeout: 5000 });
      }
      break;

    case FIELD_TYPES.DROPDOWN_VALUE:
      if (config.testID) {
        // Native <select>: check selected option text
        const el = container.getByTestId(config.testID);
        const tag = await el.evaluate((node) => node.tagName.toLowerCase()).catch(() => '');
        if (tag === 'select') {
          const selected = el.locator('option:checked');
          await expect(selected).toHaveText(expectedValue, { timeout: 5000 });
        } else {
          // ARIA combobox: check displayed value
          await expect(el).toContainText(expectedValue, { timeout: 5000 });
        }
      }
      break;

    case FIELD_TYPES.TEXT_VISIBLE:
      if (config.testID) {
        const el = container.getByTestId(config.testID);
        await expect(el).toBeVisible();
        await expect(el).toHaveText(expectedValue);
      } else {
        await expect(page.getByText(expectedValue, { exact: false }).first()).toBeVisible();
      }
      break;

    default:
      await expect(page.getByText(expectedValue, { exact: false }).first()).toBeVisible();
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// Internal: getFeatureKey helper
// ─────────────────────────────────────────────────────────────

function getFeatureKey(page) {
  return page.featureKey || null;
}
