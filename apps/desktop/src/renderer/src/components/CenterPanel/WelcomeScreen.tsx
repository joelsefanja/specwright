import React, { useEffect, useState } from "react";
import { ArrowRight, CheckCircle, FolderOpen, GitBranch, PlayCircle, ShieldCheck } from "@phosphor-icons/react";

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
      <div className="operator-welcome-shell">
        <div className="operator-welcome-setup-grid">
          <div className="operator-welcome-hero-card operator-stack-md">
            <div>
              <div className="operator-welcome-logo"><SpecwrightLogo size={58} /></div>
              <p className="operator-label operator-text-accent">Setup protocol</p>
              <h2 className="operator-welcome-title">Prepare this project</h2>
              <p className="operator-welcome-copy">
                Specwright installs a Playwright BDD workspace into your app, then guides you through issue context, browser exploration, generation, test execution, and repair.
              </p>
            </div>
            <div className="operator-welcome-selected-folder">
              <p className="operator-label">Selected folder</p>
              <p className="operator-text font-mono truncate" title={selectedFolder}>.../{folderLabel}</p>
            </div>
            <div className="operator-welcome-mini-steps">
              {[
                [ShieldCheck, "Choose authentication", "Tell Specwright how your app logs in."],
                [GitBranch, "Bootstrap framework", "Install fixtures, examples, agents, and skills."],
                [PlayCircle, "Generate and run", "Explore, write BDD tests, execute, then repair."],
              ].map(([code, title, desc]) => (
                <div key={title as string}>
                  {React.createElement(code as typeof ShieldCheck, { weight: "bold", className: "operator-welcome-step-icon" })}
                  <div>
                    <p className="operator-text font-semibold">{title}</p>
                    <p className="operator-text-subtle">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="operator-welcome-auth-card operator-stack-md">
            <div>
              <p className="operator-label operator-text-accent">Authentication</p>
              <h3 className="operator-welcome-section-title">How should tests sign in?</h3>
              <p className="operator-welcome-copy operator-welcome-copy-sm">
                This controls which auth module is installed. You can change details later from the sidebar.
              </p>
            </div>

            <div className="operator-auth-choice-list">
              {AUTH_STRATEGIES.map(({ value, title, desc }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setAuthStrategy(value)}
                  disabled={isBootstrapping}
                  className="operator-auth-choice"
                  data-selected={authStrategy === value}
                >
                  <span className="operator-auth-choice-marker" />
                  <span>
                      <p className="operator-text font-semibold">{title}</p>
                      <p className="operator-text-subtle mt-1">{desc}</p>
                  </span>
                </button>
              ))}
            </div>

            <div className="operator-welcome-action-row">
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
                  <>Bootstrap project <ArrowRight className="operator-icon" weight="bold" /></>
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
    <div className="operator-welcome-shell">
      <div className="operator-welcome-grid">
        <section className="operator-welcome-hero-card">
          <div className="operator-welcome-logo"><SpecwrightLogo size={74} /></div>
          <div className="operator-welcome-kicker-row">
            <span>Specwright</span>
            <span>Playwright BDD</span>
            <span>Agent Workbench</span>
          </div>
          <h1 className="operator-welcome-title operator-welcome-title-xl">AI test automation workspace</h1>
          <p className="operator-welcome-copy">
              Turn product work into Playwright BDD tests. Specwright reads your issue context, explores the browser, writes feature files and step definitions, runs tests, and helps repair failures.
            </p>
          <div className="operator-welcome-primary-actions">
            <button
              onClick={handlePickFolder}
              disabled={isBootstrapping}
              className="operator-welcome-primary-button"
            >
              <FolderOpen className="operator-icon" weight="bold" /> Select project folder <ArrowRight className="operator-icon" weight="bold" />
            </button>
          </div>
          <p className="operator-welcome-footnote">
            Choose an existing app repo. If it already contains Specwright files, it opens immediately. Otherwise you will bootstrap it first.
          </p>
          <div className="operator-welcome-proof-strip">
            <span><CheckCircle weight="fill" /> Local-first</span>
            <span><CheckCircle weight="fill" /> BDD scaffold</span>
            <span><CheckCircle weight="fill" /> Self-healing loop</span>
          </div>
        </section>

        <section className="operator-welcome-flow-card">
          <p className="operator-label operator-text-accent">Workflow</p>
          <h2 className="operator-welcome-section-title">From issue to runnable test</h2>
          <p className="operator-welcome-copy operator-welcome-copy-sm">A focused sequence: connect context, inspect the app, generate readable BDD, then run and repair.</p>
          <div className="operator-welcome-flow-list">
          {[
            ["01", "Connect context", "Load GitLab/Jira issues, files, or manual instructions so the agent knows what to test."],
            ["02", "Explore the app", "The browser agent validates selectors and records evidence before generation."],
            ["03", "Generate BDD", "Specwright writes feature files and step definitions into the project structure."],
            ["04", "Run and repair", "Execute tests, inspect reports, and use the healer when selectors or flows fail."],
          ].map(([code, title, desc]) => (
            <div key={code} className="operator-welcome-flow-step">
              <span>{code}</span>
              <div>
                <p className="operator-text font-semibold">{title}</p>
                <p className="operator-text-subtle mt-1">{desc}</p>
              </div>
            </div>
          ))}
          </div>
        </section>
      </div>
    </div>
  );
}
