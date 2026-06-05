/**
 * Test configuration — TEMPLATE
 *
 * Update the routes below to match YOUR app's URL structure.
 */
import { authenticationData } from './authenticationData.js';

export const testConfig = {
  baseUrl: authenticationData.baseUrl,

  credentials: {
    ...authenticationData.validCredentials,
  },

  // ┌──────────────────────────────────────────────────────────────┐
  // │  UPDATE THESE ROUTES to match your app's URL structure       │
  // │  These are used by shared/navigation.steps.js for            │
  // │  `Given I am on the "PageName" page` steps.                  │
  // └──────────────────────────────────────────────────────────────┘
  routes: {
    Home: '/home',
    SignIn: '/signin',
    // Add your app's routes here:
    // Dashboard: '/dashboard',
    // Settings: '/settings',
    // Users: '/users',
  },

  timeouts: {
    standard: 30000,
    long: 60000,
    element: 10000,
    loadState: 60000,
    navigation: 50000,
    networkIdle: 15000,
  },
};

export default testConfig;
