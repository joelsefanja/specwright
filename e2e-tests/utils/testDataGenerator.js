/**
 * Test Data Generator — faker-based data utilities
 * Used by processDataTable for dynamic value generation
 */
import { faker } from '@faker-js/faker';

/**
 * Generate a value based on the field name.
 * Uses faker to produce realistic, type-appropriate data.
 *
 * @param {string} fieldName - Human-readable field name (e.g., "Name", "Email", "Phone")
 * @returns {string} Generated value
 */
export function generateValueForField(fieldName) {
  const field = fieldName.toLowerCase();

  if (field.includes('email')) return faker.internet.email().toLowerCase();
  if (field.includes('phone')) return faker.phone.number({ style: 'national' });
  if (field.includes('name') && field.includes('company')) return faker.company.name();
  if (field.includes('name')) return faker.person.fullName();
  if (field.includes('catchphrase') || field.includes('catch phrase')) return faker.company.catchPhrase();
  if (field.includes('address') || field.includes('street')) return faker.location.streetAddress();
  if (field.includes('city')) return faker.location.city();
  if (field.includes('zip') || field.includes('postal')) return faker.location.zipCode();
  if (field.includes('country')) return faker.location.country();
  if (field.includes('state')) return faker.location.state();
  if (field.includes('website') || field.includes('url')) return faker.internet.url();
  if (field.includes('description') || field.includes('comment')) return faker.lorem.sentence();
  if (field.includes('id') || field.includes('number') || field.includes('code'))
    return faker.string.alphanumeric(8).toUpperCase();
  if (field.includes('tag')) return faker.string.alphanumeric(6).toUpperCase();
  if (field.includes('date')) return faker.date.future().toISOString().split('T')[0];
  if (field.includes('amount') || field.includes('price') || field.includes('quantity'))
    return faker.number.int({ min: 1, max: 1000 }).toString();

  // Default: random word with timestamp suffix for uniqueness
  return `${faker.lorem.word()}_${Date.now().toString().slice(-6)}`;
}
