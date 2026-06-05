/** Discovered element group from the accessibility tree */
export interface DiscoveredElementGroup {
  role: string;
  names: string[];
}

export interface AccessibilityTreeSummary {
  groups: DiscoveredElementGroup[];
  summary: string;
}

/**
 * Parse an accessibility snapshot from browser_snapshot into element groups and a summary.
 *
 * browser_snapshot returns lines like:
 *   - heading "Top TV Shows" [ref=s4e]
 *   - button "2026" [ref=s12]
 *   - link "Home" [ref=s2]
 *   - textbox "Search..." [ref=s8]
 */
export function summarizeAccessibilityTree(snapshot: string): AccessibilityTreeSummary {
  if (!snapshot) {
    return { groups: [], summary: "No elements discovered." };
  }

  const elementRegex = /^\s*-\s+(\w[\w\s]*?)\s+"([^"]+)"(?:\s+\[ref=\w+\])?/;
  const unnamedRegex = /^\s*-\s+(\w[\w\s]*?)(?:\s+\[ref=\w+\])?\s*$/;
  const roleMap = new Map<string, string[]>();

  for (const line of snapshot.split("\n")) {
    const named = line.match(elementRegex);
    if (named) {
      const role = named[1].trim().toLowerCase();
      const name = named[2].trim();
      if (!roleMap.has(role)) {
        roleMap.set(role, []);
      }

      const names = roleMap.get(role);
      if (names && !names.includes(name)) {
        names.push(name);
      }

      continue;
    }

    const unnamed = line.match(unnamedRegex);
    if (unnamed) {
      const role = unnamed[1].trim().toLowerCase();
      if (!roleMap.has(role)) {
        roleMap.set(role, []);
      }
    }
  }

  const groups: DiscoveredElementGroup[] = [];
  const summaryLines: string[] = [];
  const priorityRoles = ["heading", "navigation", "button", "link", "textbox", "combobox", "searchbox", "img", "tab", "menuitem"];
  const orderedRoles = [
    ...priorityRoles.filter((role) => roleMap.has(role)),
    ...[...roleMap.keys()].filter((role) => !priorityRoles.includes(role)),
  ];

  for (const role of orderedRoles) {
    const names = roleMap.get(role) ?? [];
    groups.push({ role, names });

    const maxDisplay = 12;
    if (names.length > 0) {
      const displayed = names.slice(0, maxDisplay).join(", ");
      const overflow = names.length > maxDisplay ? ` (+${names.length - maxDisplay} more)` : "";
      summaryLines.push(`${role}: ${displayed}${overflow}`);
      continue;
    }

    summaryLines.push(`${role}: (unnamed)`);
  }

  const totalElements = [...roleMap.values()].reduce((sum, names) => sum + Math.max(names.length, 1), 0);
  const summary = summaryLines.length > 0
    ? `Discovered ${totalElements} elements:\n${summaryLines.map((line) => `  - ${line}`).join("\n")}`
    : `Discovered ${totalElements} elements on page.`;

  return { groups, summary };
}
