import { ipcMain, shell, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

let reportServerProcess: ChildProcess | null = null;

function detectPackageManager(projectPath: string): string {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function killReportServer(): void {
  if (reportServerProcess) {
    reportServerProcess.kill();
    reportServerProcess = null;
  }
}

app.on('before-quit', killReportServer);

export function registerReportIpc(): void {
  // Returns which reports are available based on file existence
  ipcMain.handle('report:check-available', (_event, projectPath: string) => {
    const playwrightReport = path.join(projectPath, 'reports', 'playwright', 'index.html');
    const bddJson = path.join(projectPath, 'reports', 'cucumber-bdd', 'report.json');
    return {
      playwright: fs.existsSync(playwrightReport),
      bdd: fs.existsSync(bddJson),
    };
  });

  // Open Playwright HTML report via show-report server
  ipcMain.handle('report:open-playwright', async (_event, projectPath: string) => {
    killReportServer();

    const reportDir = path.join(projectPath, 'reports', 'playwright');

    reportServerProcess = spawn('npx', ['playwright', 'show-report', reportDir], {
      cwd: projectPath,
      detached: false,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });

    reportServerProcess.on('exit', () => { reportServerProcess = null; });

    // Give the server a moment to start before opening the browser
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await shell.openExternal('http://localhost:9323');
  });

  // Generate BDD HTML report if needed, then open it
  ipcMain.handle('report:open-bdd', async (_event, projectPath: string) => {
    const htmlReport = path.join(projectPath, 'reports', 'cucumber-bdd', 'html-report', 'index.html');
    const bddJson = path.join(projectPath, 'reports', 'cucumber-bdd', 'report.json');

    const htmlExists = fs.existsSync(htmlReport);
    const jsonStat = fs.existsSync(bddJson) ? fs.statSync(bddJson) : null;
    const htmlStat = htmlExists ? fs.statSync(htmlReport) : null;

    const needsGeneration = !htmlExists || (jsonStat && htmlStat && jsonStat.mtimeMs > htmlStat.mtimeMs);

    if (needsGeneration) {
      const pm = detectPackageManager(projectPath);
      const scriptPath = path.join(projectPath, 'e2e-tests', 'scripts', 'generate-bdd-report.js');

      await new Promise<void>((resolve, reject) => {
        // Try running the script directly with node first (avoids PM)
        const proc = fs.existsSync(scriptPath)
          ? spawn('node', [scriptPath], { cwd: projectPath, stdio: 'ignore', shell: process.platform === 'win32' })
          : spawn(pm, ['run', 'report:bdd'], { cwd: projectPath, stdio: 'ignore', shell: process.platform === 'win32' });

        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`BDD report generation failed (exit ${code})`));
        });
        proc.on('error', reject);
      });
    }

    await shell.openPath(htmlReport);
  });

  ipcMain.handle('report:start-test-report', async (_event, projectPath: string) => {
    killReportServer();

    const pm = detectPackageManager(projectPath);
    const command = pm === 'npm' ? ['run', 'test:report'] : ['run', 'test:report'];

    return await new Promise<{ url: string }>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Report server did not print a local URL within 20 seconds.'));
        }
      }, 20000);

      reportServerProcess = spawn(pm, command, {
        cwd: projectPath,
        detached: false,
        shell: process.platform === 'win32',
      });

      const handleOutput = (chunk: Buffer): void => {
        const text = chunk.toString();
        const url = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s]*/)?.[0];
        if (!url || settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ url });
      };

      reportServerProcess.stdout?.on('data', handleOutput);
      reportServerProcess.stderr?.on('data', handleOutput);
      reportServerProcess.on('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });
      reportServerProcess.on('exit', (code) => {
        reportServerProcess = null;
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`test:report exited before a report URL was available (exit ${code ?? 'unknown'}).`));
        }
      });
    });
  });
}
