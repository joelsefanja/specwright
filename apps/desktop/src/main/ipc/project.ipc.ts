import { ipcMain, BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";
import { exec, execFileSync } from "child_process";
import type { ConfigService } from "../services/ConfigService";
import type { ProjectService, EnvVars, InstructionCard, PluginSource } from "../services/ProjectService";
import { log as fileLog } from "../logger";

export function registerProjectIpc(
  configService: ConfigService,
  projectService: ProjectService,
  getWindow: () => BrowserWindow | null
): void {
  const quotePosix = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;
  const quoteWin = (value: string): string => `"${value.replace(/"/g, '\\"')}"`;

  const runGlab = (args: string[], cwd: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const command = process.platform === "win32"
        ? `glab ${args.map(quoteWin).join(" ")}`
        : `${fs.existsSync("/bin/zsh") ? "/bin/zsh" : fs.existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh"} -l -c ${quotePosix(`glab ${args.map(quotePosix).join(" ")}`)}`;

      fileLog(`[gitlab] cwd=${cwd}`);
      fileLog(`[gitlab] glab ${args.join(" ")}`);
      exec(command, { cwd, windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          const notFound = (error as NodeJS.ErrnoException).code === "ENOENT" || error.message.includes("not recognized");
          const message = notFound ? "glab was not found on PATH. Install GitLab CLI or add it to PATH." : (stderr || error.message || "glab command failed");
          fileLog(`[gitlab] error=${message.trim()}`);
          reject(new Error(message));
          return;
        }
        if (stderr.trim()) fileLog(`[gitlab] stderr=${stderr.trim()}`);
        fileLog(`[gitlab] ok bytes=${stdout.length}`);
        resolve(stdout);
      });
    });
  };

  const parseRepoFromGitRemote = (remote: string): string | null => {
    const trimmed = remote.trim().replace(/\.git$/, "");
    const ssh = trimmed.match(/git@[^:]+:(.+)$/);
    if (ssh) return ssh[1];
    try {
      const url = new URL(trimmed);
      return url.pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  };

  const getRepoFromGit = (cwd: string): string | null => {
    try {
      const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], {
        cwd,
        encoding: "utf-8",
        windowsHide: true,
        shell: process.platform === "win32",
      });
      return parseRepoFromGitRemote(remote);
    } catch {
      return null;
    }
  };

  const getGitLabRepoPath = async (cwd: string): Promise<string> => {
    const fromGit = getRepoFromGit(cwd);
    if (fromGit) return fromGit;

    const raw = await runGlab(["repo", "view", "--json", "fullPath"], cwd);
    const data = JSON.parse(raw) as { fullPath?: string };
    if (!data.fullPath) throw new Error("Could not detect GitLab project path from current repository.");
    return data.fullPath;
  };

  const getGitLabUsername = async (cwd: string): Promise<string | null> => {
    try {
      const raw = await runGlab(["api", "user"], cwd);
      const data = JSON.parse(raw) as { username?: string };
      return data.username ?? null;
    } catch {
      return null;
    }
  };

  const parseGitLabIssue = (input: string): { repo?: string; iid: string; kind: "issue" | "work_item" } => {
    const trimmed = input.trim();
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/^\/?(.+?)\/-\/(issues|work_items)\/(\d+)/);
      if (match) return { repo: match[1], kind: match[2] === "work_items" ? "work_item" : "issue", iid: match[3] };
    } catch { /* not a URL */ }
    const shorthand = trimmed.match(/^(.+?)#(\d+)$/);
    if (shorthand) return { repo: shorthand[1], kind: "issue", iid: shorthand[2] };
    if (/^\d+$/.test(trimmed)) return { kind: "issue", iid: trimmed };
    throw new Error("Use a GitLab issue/work item URL, project#issue, or issue number.");
  };

  const safeName = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

  const fetchGitLabItemRaw = async (
    projectPath: string,
    repo: string,
    kind: "issue" | "work_item",
    iid: string
  ): Promise<{ raw: string; resolvedKind: "issue" | "work_item" }> => {
    if (kind === "issue") {
      return {
        raw: await runGlab(["api", `projects/${encodeURIComponent(repo)}/issues/${iid}`], projectPath),
        resolvedKind: "issue",
      };
    }

    try {
      return {
        raw: await runGlab(["api", `projects/${encodeURIComponent(repo)}/work_items/${iid}`], projectPath),
        resolvedKind: "work_item",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("404")) throw error;
      fileLog(`[gitlab] work_items/${iid} returned 404; falling back to issues/${iid}`);
      return {
        raw: await runGlab(["api", `projects/${encodeURIComponent(repo)}/issues/${iid}`], projectPath),
        resolvedKind: "issue",
      };
    }
  };

  ipcMain.handle("project:pick-folder", async () => {
    return configService.pickProjectFolder(getWindow());
  });

  ipcMain.handle("project:pick-files", async () => {
    return configService.pickFiles(getWindow());
  });

  // Copy a file into e2e-tests/data/migrations/files/ and return the relative path
  ipcMain.handle("project:upload-test-file", async (_event, sourcePath: string) => {
    const projPath = configService.getProjectPath();
    if (!projPath) throw new Error("No project path");
    const destDir = path.join(projPath, "e2e-tests/data/migrations/files");
    fs.mkdirSync(destDir, { recursive: true });
    const fileName = path.basename(sourcePath);
    const destPath = path.join(destDir, fileName);
    fs.copyFileSync(sourcePath, destPath);
    return `e2e-tests/data/migrations/files/${fileName}`;
  });

  ipcMain.handle("project:fetch-gitlab-issue", async (_event, projectPath: string, issueRef: string) => {
    fileLog(`[gitlab] fetch requested ref=${issueRef} projectPath=${projectPath}`);
    let parsed: ReturnType<typeof parseGitLabIssue> | null = null;
    let repo = "";
    let resolvedKind: "issue" | "work_item" = "issue";
    let raw = "";
    try {
      parsed = parseGitLabIssue(issueRef);
      repo = parsed.repo ?? await getGitLabRepoPath(projectPath);
      if (parsed.kind === "work_item" && !parsed.repo) {
        throw new Error("GitLab work item URL must include a project path.");
      }

      const fetched = await fetchGitLabItemRaw(projectPath, repo, parsed.kind, parsed.iid);
      resolvedKind = fetched.resolvedKind;
      raw = fetched.raw;
    } catch (error) {
      fileLog(`[gitlab] fetch failed ref=${issueRef} repo=${repo || "unknown"} error=${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    const rawIssue = JSON.parse(raw) as {
      iid: number | string;
      title?: string;
      description?: string;
      state?: string;
      updatedAt?: string;
      updated_at?: string;
      webUrl?: string;
      web_url?: string;
      labels?: string[];
    };
    const issue = {
      ...rawIssue,
      updatedAt: rawIssue.updatedAt ?? rawIssue.updated_at,
      webUrl: rawIssue.webUrl ?? rawIssue.web_url,
    };

    let notesText = "";
    try {
      const notePath = parsed?.kind === "work_item"
        ? `projects/${encodeURIComponent(repo)}/work_items/${issue.iid}/notes`
        : `projects/${encodeURIComponent(repo)}/issues/${issue.iid}/notes`;
      const noteArgs = ["api", notePath, "--paginate"];
      const notesRaw = await runGlab(noteArgs, projectPath);
      const notes = JSON.parse(notesRaw) as Array<{ body?: string; author?: { username?: string }; updated_at?: string; created_at?: string }>;
      notesText = notes
        .map((note) => `### Comment by ${note.author?.username ?? "unknown"} (${note.updated_at ?? note.created_at ?? "unknown"})\n\n${note.body ?? ""}`)
        .join("\n\n");
    } catch { /* comments are best-effort */ }

    const repoLabel = safeName(repo);
    const baseName = `${repoLabel}-${resolvedKind}-${issue.iid}`;
    const destDir = path.join(projectPath, "e2e-tests/data/migrations/files/gitlab-issues");
    fs.mkdirSync(destDir, { recursive: true });
    const mdPath = path.join(destDir, `${baseName}.md`);
    const metaPath = path.join(destDir, `${baseName}.json`);
    const previous = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, "utf-8")) as { updatedAt?: string }
      : null;

    const markdown = [
      `# GitLab ${resolvedKind === "work_item" ? "Work Item" : "Issue"} #${issue.iid}: ${issue.title ?? "Untitled"}`,
      "",
      `- URL: ${issue.webUrl ?? issueRef}`,
      `- State: ${issue.state ?? "unknown"}`,
      `- Updated: ${issue.updatedAt ?? "unknown"}`,
      `- Labels: ${(issue.labels ?? []).join(", ") || "none"}`,
      "",
      "## Description",
      "",
      issue.description ?? "",
      notesText ? "\n## Comments\n\n" + notesText : "",
    ].join("\n");

    fs.writeFileSync(mdPath, markdown, "utf-8");
    fs.writeFileSync(metaPath, JSON.stringify({ issueRef, repo, kind: resolvedKind, requestedKind: parsed.kind, iid: issue.iid, updatedAt: issue.updatedAt, webUrl: issue.webUrl }, null, 2), "utf-8");
    fileLog(`[gitlab] fetch saved file=${mdPath} kind=${resolvedKind} updatedAt=${issue.updatedAt ?? "unknown"}`);

    return {
      filePath: `e2e-tests/data/migrations/files/gitlab-issues/${baseName}.md`,
      title: issue.title ?? "Untitled",
      updatedAt: issue.updatedAt ?? "",
      changed: Boolean(previous?.updatedAt && issue.updatedAt && previous.updatedAt !== issue.updatedAt),
    };
  });

  ipcMain.handle("project:list-gitlab-items", async (_event, projectPath: string) => {
    const repo = await getGitLabRepoPath(projectPath);
    const username = await getGitLabUsername(projectPath);
    const errors: string[] = [];
    const items: Array<{
      kind: "issue" | "work_item";
      iid: string;
      title: string;
      state?: string;
      updatedAt?: string;
      webUrl?: string;
      ref: string;
      assignedToMe?: boolean;
    }> = [];

    try {
      const rawIssues = await runGlab(["api", `projects/${encodeURIComponent(repo)}/issues?scope=all&per_page=50&order_by=updated_at&sort=desc`], projectPath);
      const issues = JSON.parse(rawIssues) as Array<{
        iid: number | string;
        title?: string;
        state?: string;
        updatedAt?: string;
        updated_at?: string;
        webUrl?: string;
        web_url?: string;
        assignees?: Array<{ username?: string }>;
      }>;
      for (const issue of issues) {
        items.push({
          kind: "issue",
          iid: String(issue.iid),
          title: issue.title ?? "Untitled",
          state: issue.state,
          updatedAt: issue.updatedAt ?? issue.updated_at,
          webUrl: issue.webUrl ?? issue.web_url,
          ref: issue.webUrl ?? issue.web_url ?? `${repo}#${issue.iid}`,
          assignedToMe: Boolean(username && issue.assignees?.some((a) => a.username === username)),
        });
      }
    } catch (error) {
      errors.push(`issues: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { repo, username, items: items.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")), errors };
  });

  ipcMain.handle("project:detect-plugin", (_event, p: string) => {
    return projectService.detectPlugin(p);
  });

  ipcMain.handle("project:list-auth-strategies", (_event, p: string) => {
    return projectService.listAuthStrategies(p);
  });

  ipcMain.handle(
    "project:bootstrap",
    async (_event, folderPath: string, options?: { skipAuth?: boolean; authStrategy?: string; overlay?: PluginSource }) => {
    const win = getWindow();

    const sendLog = (line: string): void => {
      win?.webContents.send("project:bootstrap-log", { line });
      fileLog(line);
    };

    sendLog("[bootstrap] Starting…");

    if (options?.overlay) {
      const overlayLabel = options.overlay.type === "local" ? options.overlay.dirPath : options.overlay.packageName;
      sendLog(`[bootstrap] Overlay: ${overlayLabel}`);
    }

    const result = await projectService.bootstrap(folderPath, options, sendLog);

    if (result.success) {
      configService.setProjectPath(folderPath);
      sendLog("[bootstrap] Done.");
    } else {
      sendLog(`[bootstrap] Error: ${result.error}`);
    }
    return result;
  });

  // Validate a local directory as a Specwright plugin (3-level check)
  ipcMain.handle("project:validate-plugin", (_event, dirPath: string) => {
    return projectService.validateLocalPlugin(dirPath);
  });

  ipcMain.handle("project:get-path", () => {
    return configService.getProjectPath();
  });

  ipcMain.handle("project:set-path", (_event, p: string) => {
    configService.setProjectPath(p);
  });

  ipcMain.handle("project:is-bootstrapped", (_event, p: string) => {
    return projectService.isBootstrapped(p);
  });

  ipcMain.handle("project:read-env", (_event, p: string) => {
    return projectService.readEnv(p);
  });

  ipcMain.handle("project:write-env", (_event, p: string, vars: EnvVars) => {
    projectService.writeEnv(p, vars);
  });

  ipcMain.handle("project:read-instructions", (_event, p: string) => {
    return projectService.readInstructions(p);
  });

  ipcMain.handle("project:write-instructions", (_event, p: string, cards: InstructionCard[]) => {
    projectService.writeInstructions(p, cards);
  });

  // ── Templates ──

  ipcMain.handle("project:read-templates", (_event, p: string) => {
    return projectService.readExampleTemplates(p);
  });

  ipcMain.handle("project:read-custom-templates", (_event, p: string) => {
    return projectService.readCustomTemplates(p);
  });

  ipcMain.handle("project:write-custom-templates", (_event, p: string, templates: unknown[]) => {
    projectService.writeCustomTemplates(p, templates as Parameters<typeof projectService.writeCustomTemplates>[1]);
  });

  // Read test:bdd* scripts from project package.json → used to populate Run Tests picker
  ipcMain.handle("project:read-test-scripts", (_event, p: string): Record<string, string> => {
    const pkgPath = path.join(p, "package.json");
    if (!fs.existsSync(pkgPath)) return {};
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const scripts: Record<string, string> = pkg.scripts ?? {};
      return Object.fromEntries(
        Object.entries(scripts).filter(([k]) => k.startsWith("test:bdd"))
      );
    } catch {
      return {};
    }
  });

  // Scan e2e-tests/features/playwright-bdd/@Modules/ and @Workflows/ to discover
  // available test modules/workflows for the Run Tests picker.
  // Only returns directories that contain at least one .feature file (recursively).
  ipcMain.handle("project:read-feature-modules", (_event, p: string): { modules: string[]; workflows: string[] } => {
    const bddRoot = path.join(p, "e2e-tests/features/playwright-bdd");

    // A module is runnable only when it has BOTH a .feature file AND a steps.js
    const hasFile = (dir: string, predicate: (name: string) => boolean): boolean => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && predicate(entry.name)) return true;
          if (entry.isDirectory() && hasFile(path.join(dir, entry.name), predicate)) return true;
        }
      } catch { /* ignore */ }
      return false;
    };

    const isRunnable = (dir: string): boolean =>
      hasFile(dir, n => n.endsWith(".feature")) &&
      hasFile(dir, n => n === "steps.js" || n === "steps.ts");

    const readDirs = (subDir: string): string[] => {
      const dir = path.join(bddRoot, subDir);
      if (!fs.existsSync(dir)) return [];
      try {
        return fs.readdirSync(dir, { withFileTypes: true })
          .filter(e => e.isDirectory() && e.name.startsWith("@") && isRunnable(path.join(dir, e.name)))
          .map(e => e.name); // e.g. "@Authentication", "@HomePage"
      } catch {
        return [];
      }
    };

    return {
      modules: readDirs("@Modules"),
      workflows: readDirs("@Workflows"),
    };
  });
}
