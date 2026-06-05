import React, { useEffect, useState, useCallback, useRef } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useConfigStore } from "@renderer/store/config.store";
import { useInstructionStore, type InstructionCard as ICard } from "@renderer/store/instruction.store";
import { EmptyState } from "../common/Discoverability";

interface TemplateEntry {
  templateName: string;
  moduleName: string;
  category: ICard["category"];
  subModules: string[];
  fileName: string;
  pageURL: string;
  steps: string[];
  filePath: string;
  suitName: string;
  explore: boolean;
  runExploredCases: boolean;
  runGeneratedCases: boolean;
  autoApprove: boolean;
}

/** Built-in quick-start templates — always available, use BASE_URL from settings */
function getBuiltInTemplates(baseUrl: string): TemplateEntry[] {
  return [
    {
      templateName: "Quick Explore",
      moduleName: "HomePage",
      category: "@Modules",
      subModules: [],
      fileName: "homepage",
      pageURL: baseUrl || "http://localhost:5173",
      steps: ["Navigate to the home page and explore all interactive elements"],
      filePath: "",
      suitName: "",
      explore: true,
      runExploredCases: false,
      runGeneratedCases: false,
      autoApprove: false,
    },
    {
      templateName: "Page Navigation",
      moduleName: "Navigation",
      category: "@Modules",
      subModules: [],
      fileName: "navigation",
      pageURL: baseUrl || "http://localhost:5173",
      steps: [
        "Navigate to the home page",
        "Verify the page title and main heading",
        "Click each navigation link and verify the URL changes",
        "Verify the active nav item is highlighted",
      ],
      filePath: "",
      suitName: "",
      explore: true,
      runExploredCases: false,
      runGeneratedCases: false,
      autoApprove: false,
    },
    {
      templateName: "Form & CRUD",
      moduleName: "FormTest",
      category: "@Modules",
      subModules: [],
      fileName: "form_test",
      pageURL: "",
      steps: [
        "Navigate to a page with a form",
        "Fill all required fields with generated data",
        "Submit the form and verify success message",
        "Verify the created item appears in the list",
        "Edit the item and verify changes persist",
        "Delete the item and verify removal",
      ],
      filePath: "",
      suitName: "",
      explore: true,
      runExploredCases: false,
      runGeneratedCases: false,
      autoApprove: false,
    },
    {
      templateName: "Auth Flow",
      moduleName: "Authentication",
      category: "@Modules",
      subModules: [],
      fileName: "authentication",
      pageURL: "",
      steps: [
        "Navigate to the sign-in page",
        "Verify sign-in form is displayed",
        "Sign in with valid credentials",
        "Verify user is authenticated (name/avatar visible)",
        "Sign out and verify redirect to sign-in page",
      ],
      filePath: "",
      suitName: "",
      explore: true,
      runExploredCases: false,
      runGeneratedCases: false,
      autoApprove: false,
    },
  ];
}

export default function TemplatePanel(): React.JSX.Element {
  const { projectPath, projectState, envVars } = useConfigStore();
  const { addCard, updateCard, serialize } = useInstructionStore();

  const [exampleTemplates, setExampleTemplates] = useState<TemplateEntry[]>([]);
  const [customTemplates, setCustomTemplates] = useState<TemplateEntry[]>([]);
  const [savingName, setSavingName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const insertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isReady = projectState === "ready" && Boolean(projectPath);
  const builtInTemplates = getBuiltInTemplates(envVars.BASE_URL || "");

  // Load project-specific templates when project is ready
  useEffect(() => {
    if (!isReady) return;
    window.specwright.project.readTemplates(projectPath).then((data) => {
      const templates = data as unknown as TemplateEntry[];
      // Filter out generic placeholders like @YourModule
      const meaningful = templates.filter(
        (t) => t.moduleName && !t.moduleName.includes("Your")
      );
      setExampleTemplates(meaningful);
    });
    window.specwright.project.readCustomTemplates(projectPath).then((data) => {
      setCustomTemplates(data as unknown as TemplateEntry[]);
    });
  }, [isReady, projectPath, refreshKey]);

  const handleInsert = useCallback(
    (tmpl: TemplateEntry) => {
      const id = addCard();
      updateCard(id, {
        moduleName: tmpl.moduleName,
        category: tmpl.category,
        subModules: tmpl.subModules || [],
        fileName: tmpl.fileName,
        pageURL: tmpl.pageURL || "",
        steps: tmpl.steps.length > 0 ? tmpl.steps : [""],
        filePath: tmpl.filePath || "",
        suitName: tmpl.suitName || "",
        explore: tmpl.explore,
        runExploredCases: tmpl.runExploredCases,
        runGeneratedCases: tmpl.runGeneratedCases,
        autoApprove: tmpl.autoApprove ?? false,
      });
      // Brief "Inserted" indicator on the button — auto-clears after 2s
      if (insertTimerRef.current) clearTimeout(insertTimerRef.current);
      setInsertedId(tmpl.templateName);
      insertTimerRef.current = setTimeout(() => setInsertedId(null), 2000);
    },
    [addCard, updateCard]
  );

  const handleSaveAsTemplate = useCallback(async () => {
    if (!savingName.trim() || !projectPath) return;
    const cards = serialize();
    if (cards.length === 0) return;

    const firstCard = cards[0] as Record<string, unknown>;
    const newTemplate: TemplateEntry = {
      templateName: savingName.trim(),
      moduleName: (firstCard.moduleName as string) || "",
      category: (firstCard.category as ICard["category"]) || "@Modules",
      subModules: (firstCard.subModules as string[]) || [],
      fileName: (firstCard.fileName as string) || "",
      pageURL: (firstCard.pageURL as string) || "",
      steps: (firstCard.steps as string[]) || [],
      filePath: (firstCard.filePath as string) || "",
      suitName: (firstCard.suitName as string) || "",
      explore: firstCard.explore === true,
      runExploredCases: firstCard.runExploredCases === true,
      runGeneratedCases: firstCard.runGeneratedCases === true,
      autoApprove: firstCard.autoApprove === true,
    };

    const updated = [...customTemplates, newTemplate];
    await window.specwright.project.writeCustomTemplates(projectPath, updated);
    setCustomTemplates(updated);
    setSavingName("");
    setShowSaveInput(false);
  }, [savingName, projectPath, customTemplates, serialize]);

  const handleDeleteCustom = useCallback(
    async (index: number) => {
      if (!projectPath) return;
      const updated = customTemplates.filter((_, i) => i !== index);
      await window.specwright.project.writeCustomTemplates(projectPath, updated);
      setCustomTemplates(updated);
    },
    [projectPath, customTemplates]
  );

  const renderTemplateCard = (
    tmpl: TemplateEntry,
    key: string,
    onDelete?: () => void
  ): React.JSX.Element => {
    let urlPath = "";
    try { urlPath = tmpl.pageURL ? new URL(tmpl.pageURL).pathname : ""; } catch { /* ignore */ }

    return (
      <div
        key={key}
        className="operator-card operator-stack-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="operator-label operator-text-accent">
              {tmpl.category === "@Workflows" ? "Workflow" : "Module"}
            </span>
            <span className="operator-template-title truncate">
              {tmpl.templateName}
            </span>
          </div>
          {onDelete && (
            <button
              onClick={onDelete}
              className="operator-muted hover:text-[var(--sw-danger)] text-xs flex-shrink-0 transition-colors"
              title="Delete template"
            >
              Delete
            </button>
          )}
        </div>

        <p className="operator-template-meta truncate">
          {tmpl.moduleName}
          {tmpl.steps.length > 0 ? ` · ${tmpl.steps.length} step${tmpl.steps.length > 1 ? "s" : ""}` : ""}
          {urlPath ? ` · ${urlPath}` : ""}
        </p>
        <button
          onClick={() => handleInsert(tmpl)}
          disabled={!isReady}
          className={`w-full text-center text-xs border px-2 py-2 transition-colors ${
            insertedId === tmpl.templateName
              ? "border-[var(--sw-success)] bg-[color-mix(in_srgb,var(--sw-success)_14%,transparent)] text-[var(--sw-success)]"
              : "operator-button-secondary disabled:opacity-50"
          }`}
        >
          {insertedId === tmpl.templateName ? "Added to Create Tests" : "Use template"}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="operator-toolbar-top flex items-center justify-between">
        <span className="operator-tab operator-tab-standalone" data-active="true">Templates</span>
        {isReady && (
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="operator-icon-button"
            title="Reload templates from disk"
          >
            <ArrowsClockwise className="operator-icon" weight="bold" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollable px-5 pt-5 pb-4 space-y-3" data-tab-staging="true">
        {!isReady && (
          <EmptyState
            title="Templates need a workspace"
            description="Open or bootstrap a project first. Then project templates and your saved templates appear here."
          />
        )}

        {isReady && <p className="operator-panel-intro">Insert a reusable brief into Create Tests, then adjust the page, module, or expected behavior.</p>}

        {/* Project-specific templates from instructions.example.js — shown first */}
        {isReady && exampleTemplates.length > 0 && (
          <div className="space-y-2">
            <p className="operator-label flex items-center gap-1">
              Project Templates
            </p>
            <p className="operator-section-help">Examples shipped with this workspace. Use these when the project already has preferred module names, URLs, or step patterns.</p>
            {exampleTemplates.map((tmpl, i) =>
              renderTemplateCard(tmpl, `example-${i}`)
            )}
          </div>
        )}

        {/* Custom user templates */}
        {isReady && (
          <div className="space-y-2">
            <p className="operator-label flex items-center gap-1">
              Custom Templates
            </p>
            <p className="operator-section-help">Your saved briefs. Good for repeated flows like login, CRUD, checkout, or role-specific workflows.</p>

            {customTemplates.length === 0 && !showSaveInput && (
              <div className="operator-inline-panel text-center">
                <p className="operator-text-subtle">No custom templates yet.</p>
                <p className="operator-field-help">Build an instruction in Create Tests, then save it here when it becomes reusable.</p>
              </div>
            )}

            {customTemplates.map((tmpl, i) =>
              renderTemplateCard(tmpl, `custom-${i}`, () => handleDeleteCustom(i))
            )}

            {showSaveInput ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAsTemplate();
                    if (e.key === "Escape") { setShowSaveInput(false); setSavingName(""); }
                  }}
                  placeholder="Template name…"
                  autoFocus
                  className="operator-field w-full px-2 py-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveAsTemplate}
                    disabled={!savingName.trim()}
                    className="operator-button-primary px-3 py-2"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setShowSaveInput(false); setSavingName(""); }}
                    className="operator-button flex-1 px-2 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="operator-button w-full border-dashed"
              >
                + Save current as template
              </button>
            )}
          </div>
        )}

        {/* Built-in quick-start templates — fallback when no project templates exist */}
        {isReady && (
          <div className="space-y-2">
            <p className="operator-label flex items-center gap-1">
              Quick Start
            </p>
            <p className="operator-section-help">Generic starting points for a blank project. Insert one, then adjust URL, module name, and expected behavior.</p>
            {builtInTemplates.map((tmpl, i) =>
              renderTemplateCard(tmpl, `builtin-${i}`)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
