import React, { useEffect, useState } from "react";

function SpecwrightLogo({ size = 48 }: { size?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 69 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Specwright logo" width={size} height={size * 40 / 69}>
      <rect x="0"  y="16" width="6" height="8"  rx="3" fill="white"/>
      <rect x="9"  y="10" width="6" height="20" rx="3" fill="white"/>
      <rect x="18" y="5"  width="6" height="30" rx="3" fill="white"/>
      <rect x="27" y="0"  width="6" height="40" rx="3" fill="white"/>
      <rect x="36" y="2"  width="6" height="36" rx="3" fill="white"/>
      <rect x="45" y="8"  width="6" height="24" rx="3" fill="white"/>
      <rect x="54" y="13" width="6" height="14" rx="3" fill="white"/>
      <rect x="63" y="17" width="6" height="6"  rx="3" fill="white"/>
    </svg>
  );
}
import { useConfigStore } from "@renderer/store/config.store";

type AuthStrategy = "email-password" | "oauth" | "none";

const AUTH_STRATEGIES: { value: AuthStrategy; title: string; desc: string }[] = [
  {
    value: "email-password",
    title: "Email + Password",
    desc: "Two-step login (email → password → optional 2FA). Installs @Authentication module.",
  },
  {
    value: "oauth",
    title: "OAuth",
    desc: "Click-based SSO or mock sign-in button. Includes localStorage injection fast-path.",
  },
  {
    value: "none",
    title: "No auth",
    desc: "Public site — skip login. @Authentication module will NOT be installed.",
  },
];

export default function WelcomeScreen(): React.JSX.Element {
  const { projectState, bootstrapLog, appendBootstrapLog, bootstrapAt, loadExistingProject } = useConfigStore();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [authStrategy, setAuthStrategy] = useState<AuthStrategy>("email-password");

  const isBootstrapping = projectState === "bootstrapping";
  const hasError = projectState === "error";

  // Wire bootstrap log IPC events
  useEffect(() => {
    const off = window.specwright.project.onBootstrapLog(({ line }) => appendBootstrapLog(line));
    return off;
  }, [appendBootstrapLog]);

  const handlePickFolder = async (): Promise<void> => {
    const folder = await window.specwright.project.pickFolder();
    if (!folder) return;
    // If already bootstrapped, load it directly — no auth step needed
    const isReady = await window.specwright.project.isBootstrapped(folder);
    if (isReady) {
      await loadExistingProject(folder);
      return;
    }
    setSelectedFolder(folder);
  };

  const handleBootstrap = async (): Promise<void> => {
    if (!selectedFolder) return;
    await bootstrapAt(selectedFolder, authStrategy);
  };

  const handleBack = (): void => {
    setSelectedFolder(null);
  };

  // ── Step 2: auth strategy selector (after folder picked) ────────────────
  if (selectedFolder) {
    const folderLabel = selectedFolder.split("/").slice(-2).join("/");
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto px-8 py-8">
        <div className="grid w-full max-w-5xl grid-cols-[1fr_1.15fr] gap-8">
          <div className="operator-card operator-stack-md">
            <div>
              <div className="mb-4"><SpecwrightLogo size={56} /></div>
              <p className="operator-label operator-text-accent">Setup</p>
              <h2 className="mt-2 text-3xl font-semibold uppercase tracking-[0.08em] text-operator-ink">Prepare this project</h2>
              <p className="operator-text-muted mt-3">
                Specwright installs a Playwright BDD workspace into your app, then guides you through issue context, browser exploration, generation, test execution, and repair.
              </p>
            </div>
            <div className="operator-inline-panel operator-stack-sm">
              <p className="operator-label">Selected folder</p>
              <p className="operator-text font-mono truncate" title={selectedFolder}>.../{folderLabel}</p>
            </div>
            <div className="operator-stack-sm">
              {[
                ["01", "Choose authentication", "Tell Specwright how your app logs in."],
                ["02", "Bootstrap framework", "Install the plugin, fixtures, examples, and agent instructions."],
                ["03", "Add work context", "Attach GitLab/Jira/files so generated tests match real tasks."],
                ["04", "Generate and run", "Explore the app, write BDD tests, run them, then repair failures."],
              ].map(([code, title, desc]) => (
                <div key={code} className="grid grid-cols-[40px_1fr] gap-3 border-t border-operator-line pt-3 first:border-t-0 first:pt-0">
                  <span className="operator-label operator-text-accent">{code}</span>
                  <div>
                    <p className="operator-text font-semibold">{title}</p>
                    <p className="operator-text-subtle">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="operator-card operator-stack-md">
            <div>
              <p className="operator-label">Authentication</p>
              <h3 className="mt-2 text-xl font-semibold text-operator-ink">How should tests sign in?</h3>
              <p className="operator-text-muted mt-2">
                This controls which auth module is installed. You can change details later from the sidebar.
              </p>
            </div>

            <div className="operator-stack-sm">
              {AUTH_STRATEGIES.map(({ value, title, desc }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setAuthStrategy(value)}
                  disabled={isBootstrapping}
                  className={`operator-list-item border ${authStrategy === value ? "border-[var(--sw-accent)] bg-[var(--sw-accent-soft)]" : "border-operator-line bg-operator-field"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-3 w-3 border ${authStrategy === value ? "border-[var(--sw-accent)] bg-[var(--sw-accent)]" : "border-operator-line"}`} />
                    <div>
                      <p className="operator-text font-semibold">{title}</p>
                      <p className="operator-text-subtle mt-1">{desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-operator-line pt-4">
              <button
                onClick={handleBack}
                disabled={isBootstrapping}
                className="operator-button disabled:opacity-50"
              >
                Change folder
              </button>
              <button
                onClick={handleBootstrap}
                disabled={isBootstrapping}
                className="operator-button-primary px-6 py-2 disabled:opacity-50"
              >
                {isBootstrapping ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent animate-spin" />
                    Bootstrapping
                  </>
                ) : (
                  <>Bootstrap project</>
                )}
              </button>
            </div>

            {(isBootstrapping || hasError) && bootstrapLog.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="operator-label font-mono">Bootstrap log</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(bootstrapLog.join("\n"))}
                    className="operator-button px-2 py-1"
                    title="Copy log to clipboard"
                  >
                    Copy logs
                  </button>
                </div>
                <div className="operator-list max-h-48 overflow-y-auto p-3 font-mono operator-text-subtle">
                  {bootstrapLog.map((line, i) => (
                    <div key={i} className={line.includes("Error") ? "operator-danger" : ""}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasError && (
              <p className="operator-danger">
                Bootstrap failed. Check the log above and try again.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: landing (pick folder) ────────────────────────────────────────
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-8 py-8">
      <div className="grid w-full max-w-6xl grid-cols-[1.05fr_1fr] gap-8">
        <div className="operator-card operator-stack-md">
          <div>
            <div className="mb-5"><SpecwrightLogo size={72} /></div>
            <p className="operator-label operator-text-accent">Specwright</p>
            <h1 className="mt-3 text-4xl font-semibold uppercase tracking-[0.08em] text-operator-ink">AI test automation workspace</h1>
            <p className="operator-text-muted mt-4 max-w-xl">
              Turn product work into Playwright BDD tests. Specwright reads your issue context, explores the browser, writes feature files and step definitions, runs tests, and helps repair failures.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handlePickFolder}
              disabled={isBootstrapping}
              className="operator-button-primary gap-3 px-8 py-4"
            >
              Select project folder
            </button>
          </div>
          <p className="operator-text-subtle">
            Choose an existing app repo. If it already contains Specwright files, it opens immediately. Otherwise you will bootstrap it first.
          </p>
        </div>

        <div className="operator-card operator-stack-md">
          <div>
            <p className="operator-label">How the workflow works</p>
            <h2 className="mt-2 text-2xl font-semibold text-operator-ink">From issue to runnable test</h2>
          </div>
          {[
            ["01", "Connect context", "Load GitLab/Jira issues, files, or manual instructions so the agent knows what to test."],
            ["02", "Explore the app", "The browser agent validates selectors and records evidence before generation."],
            ["03", "Generate BDD", "Specwright writes feature files and step definitions into the project structure."],
            ["04", "Run and repair", "Execute tests, inspect reports, and use the healer when selectors or flows fail."],
          ].map(([code, title, desc]) => (
            <div key={code} className="operator-inline-panel grid grid-cols-[44px_1fr] gap-3">
              <span className="operator-label operator-text-accent">{code}</span>
              <div>
                <p className="operator-text font-semibold">{title}</p>
                <p className="operator-text-subtle mt-1">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
