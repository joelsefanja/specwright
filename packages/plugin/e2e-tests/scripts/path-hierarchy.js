/**
 * Extract directory hierarchy from a feature URI.
 *
 * URI pattern: e2e-tests/features/playwright-bdd/{Category}/{Module}/{SubModule}/file.feature
 *
 * Examples:
 *   .../@Modules/@HomePage/homepage.feature
 *     -> { Category: "@Modules", Module: "@HomePage" }
 *
 *   .../@Workflows/@FavoritesWorkflow/@0-Precondition/setup.feature
 *     -> { Category: "@Workflows", Module: "@FavoritesWorkflow", "Sub-Module": "@0-Precondition" }
 */
export const extractHierarchy = uri => {
  const marker = "playwright-bdd/";
  const markerIndex = uri.indexOf(marker);
  if (markerIndex === -1) {
    return {};
  }

  const relativePath = uri.slice(markerIndex + marker.length);
  const segments = relativePath.split("/").filter(segment => segment.length > 0);
  segments.pop();

  const hierarchy = {};
  if (segments.length >= 1) {
    hierarchy.Category = segments[0];
  }
  if (segments.length >= 2) {
    hierarchy.Module = segments[1];
  }
  if (segments.length >= 3) {
    hierarchy["Sub-Module"] = segments.slice(2).join("/");
  }

  return hierarchy;
};

/**
 * Get all path segments after playwright-bdd/ (excluding the filename).
 */
export const getFeatureDirectorySegments = uri => {
  const marker = "playwright-bdd/";
  const markerIndex = uri.indexOf(marker);
  if (markerIndex === -1) {
    return [];
  }

  const relativePath = uri.slice(markerIndex + marker.length);
  const segments = relativePath.split("/").filter(segment => segment.length > 0);
  segments.pop();
  return segments;
};
