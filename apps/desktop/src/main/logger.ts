/**
 * File logger for the Specwright Electron main process.
 *
 * Strategy:
 *   - Each app launch creates a new file: specwright-YYYY-MM-DDTHH-mm.log
 *   - On startup, any log files from previous calendar days are deleted
 *   - Today's files (multiple launches) are all kept
 *
 * Location:
 *   macOS:   ~/Library/Logs/Specwright/
 *   Windows: %APPDATA%\Specwright\logs\
 *   Linux:   ~/.config/Specwright/logs/
 */

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

let _logFilePath: string | null = null;
let _logStream: fs.WriteStream | null = null;
let _enabled = true;

/** Format a Date as `YYYY-MM-DD` (local time). */
function dateStamp(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a Date as `YYYY-MM-DDTHH-mm` (local time, safe for filenames). */
function launchStamp(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dateStamp(d)}T${h}-${min}`;
}

/** Initialise the log file (call once from app.whenReady). */
export function initLogger(): void {
  try {
    const logsDir = app.getPath("logs");
    fs.mkdirSync(logsDir, { recursive: true });

    // Delete log files from previous calendar days
    const today = dateStamp(new Date());
    try {
      for (const entry of fs.readdirSync(logsDir)) {
        if (!entry.startsWith("specwright-") || !entry.endsWith(".log")) continue;
        // Filename: specwright-YYYY-MM-DDTHH-mm.log  → date part is chars 11..20
        const fileDatePart = entry.slice(11, 21); // "YYYY-MM-DD"
        if (fileDatePart && fileDatePart !== today) {
          fs.unlinkSync(path.join(logsDir, entry));
        }
      }
    } catch {
      // best-effort cleanup — never block startup
    }

    // New file for this launch
    const stamp = launchStamp(new Date());
    _logFilePath = path.join(logsDir, `specwright-${stamp}.log`);

    _logStream = fs.createWriteStream(_logFilePath, { flags: "w", encoding: "utf-8" });
    _logStream.write(`Specwright — ${new Date().toISOString()}\n${"─".repeat(60)}\n`);
  } catch (err) {
    // Logger failures must never crash the app
    console.error("[logger] Failed to initialise log file:", err);
  }
}

/** Write a line to the log file with a timestamp prefix. */
export function log(line: string): void {
  if (!_logStream || !_enabled) return;
  try {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
    _logStream.write(`[${ts}] ${line}\n`);
  } catch {
    // ignore write errors
  }
}

/** Return the absolute path to the current log file (or null if not initialised). */
export function getLogFilePath(): string | null {
  return _logFilePath;
}

export function clearLocalLogs(): number {
  let removed = 0;
  try {
    const logsDir = app.getPath("logs");
    for (const entry of fs.readdirSync(logsDir)) {
      if (!entry.startsWith("specwright-") || !entry.endsWith(".log")) continue;
      const fullPath = path.join(logsDir, entry);
      if (fullPath === _logFilePath) continue;
      fs.unlinkSync(fullPath);
      removed += 1;
    }
    log(`[logger] Cleared ${removed} old log file(s)`);
  } catch (err) {
    log(`[logger] Failed to clear logs: ${err instanceof Error ? err.message : String(err)}`);
  }
  return removed;
}

/** Return whether file logging is currently enabled. */
export function isLoggingEnabled(): boolean {
  return _enabled;
}

/** Enable or disable writing log lines to the file. */
export function setLoggingEnabled(enabled: boolean): void {
  _enabled = enabled;
  // Always write the toggle event itself, regardless of the new state
  if (_logStream) {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
    _logStream.write(`[${ts}] [logger] Logging ${enabled ? "enabled" : "disabled"} by user\n`);
  }
}

/** Flush and close the log stream (call on app before-quit). */
export function closeLogger(): void {
  try {
    _logStream?.end();
    _logStream = null;
  } catch {
    // ignore
  }
}
