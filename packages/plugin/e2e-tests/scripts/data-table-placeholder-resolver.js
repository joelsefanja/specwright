/**
 * Replace DataTable value placeholders (<from_test_data>, <gen_test_data>)
 * with actual resolved values extracted from step attachments.
 *
 * During test execution, processDataTable() in stepHelpers.js attaches resolved
 * values as text/plain embeddings: ✅ Mapped "FieldName" → "key": ActualValue
 *
 * These logs end up on hook steps (Before/After), not on the DataTable step itself.
 * Pass 1: collect ALL resolved values from the entire scenario.
 * Pass 2: replace placeholder cells in DataTable steps.
 */
export const resolveDataTablePlaceholders = reportData => {
  const placeholders = new Set(["<from_test_data>", "<gen_test_data>"]);
  const mappedLineRegex = /Mapped "(.+?)"\s*→\s*"(.+?)":\s*(.+)/;
  const legacyLineRegex = /^(.+?):\s*(<[^>]+>)\s*→\s*(.+)$/;
  const logMimeTypes = new Set(["text/plain", "text/x.cucumber.log+plain"]);
  let resolved = 0;

  for (const feature of reportData) {
    for (const scenario of feature.elements || []) {
      const resolvedMap = new Map();

      for (const step of scenario.steps || []) {
        for (const embedding of step.embeddings || []) {
          if (!logMimeTypes.has(embedding.mime_type) || !embedding.data) {
            continue;
          }

          const text = Buffer.from(embedding.data, "base64").toString("utf8");
          for (const line of text.split("\n")) {
            const mapped = line.match(mappedLineRegex);
            if (mapped) {
              resolvedMap.set(mapped[1].trim(), mapped[3].trim());
              continue;
            }

            const legacy = line.match(legacyLineRegex);
            if (legacy) {
              resolvedMap.set(legacy[1].trim(), legacy[3].trim());
            }
          }
        }
      }

      if (resolvedMap.size === 0) {
        continue;
      }

      for (const step of scenario.steps || []) {
        const rows = step.arguments?.[0]?.rows;
        if (!rows) {
          continue;
        }

        for (const row of rows) {
          const fieldName = row.cells[0];
          const cellValue = row.cells[1];
          if (placeholders.has(cellValue) && resolvedMap.has(fieldName)) {
            row.cells[1] = resolvedMap.get(fieldName);
            resolved++;
          }
        }
      }
    }
  }

  if (resolved > 0) {
    console.log(`   Resolved ${resolved} DataTable placeholder(s)`);
  }
};
