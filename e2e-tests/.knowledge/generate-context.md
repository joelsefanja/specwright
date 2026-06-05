# Framework Generation Context
<!-- Regenerate: node e2e-tests/scripts/extract-generate-context.js -->
<!-- Last updated: 2026-04-19 -->

## FIELD_TYPES Constants

Import paths are depth-dependent — see **Import Path Depth Reference** table below.

### Interaction Types (processDataTable fieldConfig)

| Constant | Value | When to Use | Config Shape |
|---|---|---|---|
| `FIELD_TYPES.FILL` | `"FILL"` | Plain text input | `{ testID? / selector? / placeholder? }` |
| `FIELD_TYPES.FILL_AND_ENTER` | `"FILL_AND_ENTER"` | Fill then press Enter (tags, chips) | `{ name: string, role?: string }` |
| `FIELD_TYPES.DROPDOWN` | `"DROPDOWN"` | Native `<select>` or ARIA combobox | `{ testID? }` |
| `FIELD_TYPES.CLICK` | `"CLICK"` | Button / toggle via click | `{ testID? / selector? / role? / name? }` |
| `FIELD_TYPES.CHECKBOX_TOGGLE` | `"CHECKBOX_TOGGLE"` | Checkbox by label text | `{ testID? }` |
| `FIELD_TYPES.TOGGLE` | `"TOGGLE"` | Boolean toggle switch (role="switch") | `{ testID? / selector? }` |
| `FIELD_TYPES.CUSTOM` | `"CUSTOM"` | Unique interaction — requires fieldHandlers entry | write a fieldHandler |

### Validation Types (validateExpectations validationConfig)

| Constant | When to Use | Config Shape |
|---|---|---|
| `FIELD_TYPES.INPUT_VALUE` | Assert text input .value (toHaveValue) | `{ testID? / selector? }` |
| `FIELD_TYPES.DROPDOWN_VALUE` | Assert selected dropdown option text | `{ testID? }` |
| `FIELD_TYPES.TEXT_VISIBLE` | Assert element text visible by testID | `{ testID }` |

---

## processDataTable / validateExpectations API

```javascript
// Form fill — handles <gen_test_data> and <from_test_data> automatically
await processDataTable(page, dataTable, {
  mapping: fieldMapping,        // { 'Field Name': 'cacheKey' }
  fieldConfig: FIELD_CONFIG,    // { 'Field Name': { type: FIELD_TYPES.FILL, testID: '...' } }
  fieldHandlers: {},            // only for FIELD_TYPES.CUSTOM entries
  container: page,              // optional — scope locators to element (modal, section)
});

// Assertion — reads <from_test_data> from cache automatically
await validateExpectations(page, dataTable, {
  mapping: fieldMapping,
  validationConfig: VALIDATION_CONFIG,
  container: page,
});
```

**Auto-handling:**
- `<gen_test_data>` + `SharedGenerated` — calls generateValueForField(fieldName), caches in page.testData and featureDataCache
- `<from_test_data>` + `SharedGenerated` — reads from page.testData or featureDataCache
- Static values — passed through as-is

---

## generateValueForField Patterns

| Field name contains | Generated value |
|---|---|
| `email` | faker.internet.email().toLowerCase() |
| `phone` | faker.phone.number({ style: 'national' }) |
| `name` + `company` | faker.company.name() |
| `name` | faker.person.fullName() |
| `catchphrase` / `catch phrase` | faker.company.catchPhrase() |
| `address` / `street` | faker.location.streetAddress() |
| `city` | faker.location.city() |
| `zip` / `postal` | faker.location.zipCode() |
| `country` | faker.location.country() |
| `state` | faker.location.state() |
| `website` / `url` | faker.internet.url() |
| `description` / `comment` | faker.lorem.sentence() |
| `id` / `number` / `code` | faker.string.alphanumeric(8).toUpperCase() |
| `tag` | faker.string.alphanumeric(6).toUpperCase() |
| `date` | ISO date string (future) |
| `amount` / `price` / `quantity` | Random int 1-1000 as string |
| (default) | {word}_{timestamp-6-digits} |

---

## Import Path Depth Reference

Count directory levels from `features/playwright-bdd/` root.

| Steps file location | fixtures.js import | stepHelpers.js import |
|---|---|---|
| `shared/steps.js` | `../../../playwright/fixtures.js` | `../../../utils/stepHelpers.js` |
| `@Modules/@Mod/steps.js` | `../../../../playwright/fixtures.js` | `../../../../utils/stepHelpers.js` |
| `@Modules/@Mod/@Sub/steps.js` | `../../../../../playwright/fixtures.js` | `../../../../../utils/stepHelpers.js` |
| `@Workflows/@Flow/@0-Pre/steps.js` | `../../../../../playwright/fixtures.js` | `../../../../../utils/stepHelpers.js` |

---

## Complete steps.js Pattern

Use the Import Path Depth Reference table above to determine the correct `../` depth for the file's location.

```javascript
// Example: @Modules/@Mod/steps.js → depth ../../../../
import { Given, When, Then, expect } from '../../../../playwright/fixtures.js';
import { FIELD_TYPES, processDataTable, validateExpectations } from '../../../../utils/stepHelpers.js';

// LOCAL to this file — never export FIELD_CONFIG or put in stepHelpers.js
const FIELD_CONFIG = {
  Name:  { type: FIELD_TYPES.FILL, testID: 'name-input' },
  Email: { type: FIELD_TYPES.FILL, testID: 'email-input' },
};

const VALIDATION_CONFIG = {
  Name:  { type: FIELD_TYPES.TEXT_VISIBLE, testID: 'display-name' },
  Email: { type: FIELD_TYPES.TEXT_VISIBLE, testID: 'display-email' },
};

const fieldMapping = { Name: 'name', Email: 'email' };

When('I fill the form with:', async ({ page }, dataTable) => {
  await processDataTable(page, dataTable, { mapping: fieldMapping, fieldConfig: FIELD_CONFIG });
});

Then('I should see the submitted details:', async ({ page }, dataTable) => {
  await validateExpectations(page, dataTable, { mapping: fieldMapping, validationConfig: VALIDATION_CONFIG });
});
```
