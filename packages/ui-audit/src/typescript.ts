export interface TypeScriptDiagnostic {
  file?: string;
  line?: number;
  column?: number;
  code: string;
  message: string;
  raw: string;
}

export function parseTypeScriptDiagnostics(output: string): TypeScriptDiagnostic[] {
  const diagnostics: TypeScriptDiagnostic[] = [];
  const pattern = /^(?:(.+?)\((\d+),(\d+)\):\s*)?error\s+(TS\d+):\s+(.+)$/;
  for (const raw of output.split(/\r?\n/)) {
    const match = raw.match(pattern);
    if (!match) continue;
    diagnostics.push({
      file: match[1],
      line: match[2] ? Number(match[2]) : undefined,
      column: match[3] ? Number(match[3]) : undefined,
      code: match[4],
      message: match[5],
      raw,
    });
  }
  return diagnostics;
}
