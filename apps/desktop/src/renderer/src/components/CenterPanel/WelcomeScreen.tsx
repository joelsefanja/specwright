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
    title: "E-mail en wachtwoord",
    desc: "Gebruik dit als de test inlogt met vaste testgegevens.",
  },
  {
    value: "oauth",
    title: "OAuth",
    desc: "Gebruik dit als je app via een knop of SSO inlogt.",
  },
  {
    value: "none",
    title: "Geen login",
    desc: "Gebruik dit als iedereen de app kan openen.",
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
              <p className="operator-label operator-text-accent">Project klaarzetten</p>
              <h2 className="operator-welcome-title">Bereid je project voor</h2>
              <p className="operator-welcome-copy">
                Specwright zet de testmap klaar en helpt je daarna een eerste test maken en uitvoeren.
              </p>
            </div>
            <div className="operator-welcome-selected-folder">
              <p className="operator-label">Gekozen projectmap</p>
              <p className="operator-text font-mono truncate" title={selectedFolder}>.../{folderLabel}</p>
            </div>
            <div className="operator-welcome-mini-steps">
              {[
                [ShieldCheck, "Kies login", "Geef aan of tests moeten inloggen."],
                [GitBranch, "Zet testbestanden klaar", "Specwright voegt de basis toe."],
                [PlayCircle, "Maak en start", "Maak een test en controleer het resultaat."],
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
              <p className="operator-label operator-text-accent">Login</p>
              <h3 className="operator-welcome-section-title">Moeten tests inloggen?</h3>
              <p className="operator-welcome-copy operator-welcome-copy-sm">
                Kies wat past bij je app. Je kunt dit later aanpassen.
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
                Andere map kiezen
              </button>
              <button
                onClick={handleBootstrap}
                disabled={isBootstrapping}
                className="operator-button-primary px-6 py-2 disabled:opacity-50"
              >
                {isBootstrapping ? (
                  <>
                    <span className="operator-loading-spinner h-4 w-4" />
                     Project klaarzetten
                  </>
                ) : (
                   <>Project klaarzetten <ArrowRight className="operator-icon" weight="bold" /></>
                )}
              </button>
            </div>

            {(isBootstrapping || hasError) && bootstrapLog.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="operator-label font-mono">Voortgang</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(bootstrapLog.join("\n"))}
                    className="operator-button px-2 py-1"
                    title="Kopieer voortgang"
                  >
                    Kopiëren
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
                Project klaarzetten is niet gelukt. Bekijk de voortgang en probeer opnieuw.
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
            <span>Automatische tests</span>
            <span>Lokaal op je computer</span>
          </div>
          <h1 className="operator-welcome-title operator-welcome-title-xl">Maak tests vanuit je app</h1>
          <p className="operator-welcome-copy">
              Beschrijf wat een gebruiker moet kunnen doen. Specwright bekijkt je app, maakt een test en laat zien of die werkt.
            </p>
          <div className="operator-welcome-primary-actions">
            <button
              onClick={handlePickFolder}
              disabled={isBootstrapping}
              className="operator-welcome-primary-button"
            >
               <FolderOpen className="operator-icon" weight="bold" /> Projectmap kiezen <ArrowRight className="operator-icon" weight="bold" />
            </button>
          </div>
          <p className="operator-welcome-footnote">
            Kies de map van je app. Als Specwright daar al staat, openen we die direct.
          </p>
          <div className="operator-welcome-proof-strip">
            <span><CheckCircle weight="fill" /> Local-first</span>
            <span><CheckCircle weight="fill" /> Tests in je project</span>
            <span><CheckCircle weight="fill" /> Hulp bij fouten</span>
          </div>
        </section>

        <section className="operator-welcome-flow-card">
          <p className="operator-label operator-text-accent">Zo werkt het</p>
          <h2 className="operator-welcome-section-title">Van idee naar werkende test</h2>
          <p className="operator-welcome-copy operator-welcome-copy-sm">Eerst beschrijf je de test. Daarna bekijkt Specwright de app, maakt de test en controleert het resultaat.</p>
          <div className="operator-welcome-flow-list">
          {[
            ["01", "Beschrijf de test", "Vertel wat de gebruiker moet kunnen doen."],
            ["02", "Bekijk de app", "Specwright zoekt de juiste knoppen, velden en teksten."],
            ["03", "Maak de test", "De test wordt opgeslagen in je project."],
            ["04", "Controleer resultaat", "Start de test en verbeter wat nog niet werkt."],
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
