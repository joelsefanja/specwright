# Architecture Improvement Plan

This plan turns the coding guidelines into a pragmatic refactoring roadmap. The goal is maintainability, not a rewrite.

## Executive Summary

Specwright has strong product boundaries at the package level, but several files now carry too many responsibilities. The biggest risk is not a missing design pattern; it is orchestration code, UI state, process management, provider protocols, and styling accumulating in single files.

The strategy is incremental extraction behind existing behavior:

1. Put explicit boundaries around Desktop main, Desktop renderer, provider adapters, and plugin runtime.
2. Extract pure logic and IO adapters first because those are easiest to test.
3. Split large UI components by user-visible sections and local state ownership.
4. Add focused tests around command resolution, environment handling, and provider protocol behavior before moving risky code.
5. Keep public contracts stable until the extracted modules are proven.

## Current Hotspots

Measured from tracked source files:

| File | Lines | Risk |
|---|---:|---|
| `apps/desktop/src/renderer/src/index.css` | 2830 | Global style coupling, hard to delete safely |
| `apps/desktop/src/main/ipc/pipeline.ipc.ts` | 1421 | IPC, process lifecycle, command resolution, local app management, agent execution mixed together |
| `apps/desktop/src/renderer/src/components/LeftPanel/ConfigPanel.tsx` | 1083 | Form state, env mapping, validation, provider config, project settings mixed in one component |
| `apps/desktop/src/main/services/ProjectService.ts` | 1062 | Project detection, bootstrap, filesystem, GitLab/source handling likely mixed |
| `packages/agent-runner/src/providers/opencode.ts` | 1026 | HTTP, SSE, CLI, ACP, model/provider detection, and generation flow mixed |
| `apps/desktop/src/renderer/src/components/CenterPanel/InstructionCard.tsx` | 1023 | Source selection, GitLab issue UI, preview, form editing, and image interactions mixed |
| `packages/plugin/e2e-tests/scripts/generate-bdd-report.js` | 630 | Script likely combines parsing, transformation, IO, and rendering |
| `apps/desktop/src/main/ipc/project.ipc.ts` | 521 | IPC handler growth risk |
| `packages/mcp-server/tools/configure.js` | 479 | Tool command and config mutation risk |
| `apps/desktop/src/renderer/src/components/CenterPanel/AgentOutputPanel.tsx` | 478 | Output rendering and run-state presentation risk |

## Architecture Principles For This Refactor

- No big-bang rewrite.
- Preserve behavior with characterization tests before moving complex code.
- Extract by reason to change, not by technical layer alone.
- Prefer pure functions first. They are cheap to test and safe to move.
- Keep integration seams explicit: IPC payloads, provider contracts, fixture env vars, and generated file paths.
- Do not introduce frameworks, dependency injection containers, or broad abstractions without immediate use.
- Make illegal states harder to represent with typed discriminated unions and narrow contracts.

## Target Shape

### Desktop Main Process

Current smell: `pipeline.ipc.ts` is a coordinator, command resolver, process runner, local app manager, agent session manager, and logger.

Target modules:

```text
apps/desktop/src/main/pipeline/
  registerPipelineIpc.ts       # IPC registration only
  directTestRun.ts             # /e2e-run orchestration
  runCommandResolver.ts        # script/tag/project selection
  directRunOptions.ts          # --headed, --integrated-browser, future flags
  childProcessRunner.ts        # spawn, timeout, output streaming
  localAppManager.ts           # detect/start/stop required local apps
  generatedSpecStats.ts        # .features-gen timestamp/count logic
  outputDiagnostics.ts         # known failure diagnostics
  agentSession.ts              # Claude/OpenCode pipeline execution
  permissionBridge.ts          # permission request tracking
```

Rules:

- IPC files register handlers and call services. They should not contain business logic.
- Command resolution is pure and tested with table tests.
- Process execution is isolated behind a small runner contract.
- Environment parsing is centralized and typed.
- State that spans active runs is grouped in one `PipelineRuntimeState` object instead of loose module globals.

First extractions:

1. `runCommandResolver.ts` from script/tag resolution functions.
2. `directRunOptions.ts` from `--headed` and `--integrated-browser` parsing.
3. `localAppManager.ts` from URL detection and local app spawning.
4. `childProcessRunner.ts` from `runChildCommand`.

Acceptance criteria:

- `pipeline.ipc.ts` falls below 450 lines.
- Command resolution has unit tests for scripts, tags, custom flags, workflow tags, and unknown input.
- Direct test runs still pass from Desktop.
- No renderer API changes unless intentional.

### Desktop Renderer

Current smell: large components own both layout and workflow logic.

Target pattern:

```text
components/<Feature>/
  <Feature>Panel.tsx           # composition only
  <Feature>Header.tsx
  <Feature>Form.tsx
  <Feature>Preview.tsx
  use<Feature>State.ts         # local orchestration, no shell/process knowledge
  <feature>.types.ts
```

Config panel target split:

```text
components/LeftPanel/ConfigPanel/
  ConfigPanel.tsx
  ProjectSection.tsx
  AuthSection.tsx
  LlmProviderSection.tsx
  OpenCodeSection.tsx
  EnvironmentSection.tsx
  ReadinessSection.tsx
  useConfigPanelState.ts
  configViewModel.ts
```

Instruction card target split:

```text
components/CenterPanel/InstructionCard/
  InstructionCard.tsx
  InstructionFields.tsx
  GitLabSourcePicker.tsx
  SelectedSourceSummary.tsx
  SourcePreview.tsx
  ImagePreviewDialog.tsx
  useInstructionSource.ts
  instructionSource.types.ts
```

Rules:

- React components render and dispatch user intent.
- Hooks may orchestrate renderer-only concerns, but they must not construct shell commands.
- Stores expose domain actions, not low-level mutation shortcuts for every field.
- View-model functions should be pure and tested when they contain branching.

Acceptance criteria:

- `ConfigPanel.tsx` below 300 lines.
- `InstructionCard.tsx` below 300 lines.
- No new prop drilling chains longer than two levels; use a local context only if it reduces real duplication.
- Existing Playwright Desktop screenshots still pass or are intentionally updated.

### Desktop Styling

Current smell: `index.css` is too large and global.

Target split:

```text
apps/desktop/src/renderer/src/styles/
  tokens.css
  base.css
  layout.css
  controls.css
  command-palette.css
  run-console.css
  panels.css
  modals.css
  utilities.css
```

Rules:

- Keep CSS variables in `tokens.css`.
- Keep reset and app shell in `base.css`.
- Component-specific classes move to feature CSS files only when the component is stable.
- Avoid adding more global selectors to `index.css`; it should become imports only.
- Delete unused classes during component extraction.

Acceptance criteria:

- `index.css` becomes an import file under 80 lines.
- No visual regressions in Desktop screenshot specs.
- New styles are grouped by UI responsibility.

### Agent Runner Providers

Current smell: `opencode.ts` mixes provider discovery, HTTP transport, event streaming, CLI fallback, ACP protocol, and model normalization.

Target modules:

```text
packages/agent-runner/src/providers/opencode/
  index.ts                     # public provider export
  model.ts                     # normalize/resolve model and provider id
  httpClient.ts                # fetch wrapper and endpoint types
  sessionApi.ts                # session/message API
  eventStream.ts               # SSE event handling
  cliRunner.ts                 # opencode run fallback
  acpClient.ts                 # ACP JSON-RPC protocol
  textExtraction.ts            # parts/tool result normalization
  opencode.types.ts
```

Rules:

- Each transport has one module.
- Model/provider resolution is pure where possible.
- Public provider contract stays in `providers/types.ts`.
- Avoid `as unknown as` except at unavoidable third-party boundaries, and isolate those boundaries.

Acceptance criteria:

- `opencode.ts` replaced by a small export file.
- ACP streaming has focused tests or a lightweight protocol fixture.
- Existing OpenCode direct generation still streams tokens.
- HTTP fallback behavior remains documented.

### Plugin Runtime And Generated Test Framework

Current smell: fixture files and reporting scripts are growing and are copied into consumers.

Target modules:

```text
packages/plugin/e2e-tests/playwright/
  fixtures.js                  # createBdd and fixture composition only
  fixtures/
    scoped-test-data.js
    browser-reuse.js
    cdp-browser.js
    coverage.js
    storage-state.js
```

Rules:

- `fixtures.js` composes fixtures and exports BDD helpers.
- Browser reuse, CDP mode, storage state application, and coverage are separate modules.
- Generated consumer compatibility must be maintained.
- Any plugin fixture extraction must be tested in at least one example app and one real consumer when possible.

Acceptance criteria:

- Plugin `fixtures.js` below 180 lines.
- CDP mode remains opt-in.
- Normal Playwright runs are unchanged.
- Example app E2E still passes.

## Refactor Phases

### Phase 0: Safety Net

Goal: make behavior observable before moving code.

Tasks:

- Add unit tests for direct run command resolution.
- Add tests for direct run option parsing.
- Add a simple fixture test for env parsing of `.env.testing`.
- Keep Desktop screenshot tests as visual regression checks.

Verification:

- `pnpm --filter @specwright/desktop build`
- `pnpm --filter @specwright/desktop test:e2e` where practical
- `pnpm --filter @specwright/agent-runner build`

### Phase 1: Desktop Main Process Extraction

Goal: shrink `pipeline.ipc.ts` without changing behavior.

Order:

1. Extract pure run command resolution.
2. Extract direct run options.
3. Extract local app discovery/start/stop.
4. Extract child process runner.
5. Group active process/session globals into one runtime object.

Stop condition:

- If any Desktop direct run behavior changes, stop and add a characterization test before continuing.

### Phase 2: Provider Adapter Extraction

Goal: make OpenCode support understandable and testable.

Order:

1. Extract model/provider normalization.
2. Extract HTTP session API.
3. Extract ACP client.
4. Extract CLI fallback.
5. Leave `index.ts` as the only public entry.

Stop condition:

- If streaming behavior regresses or token chunks become buffered, stop and fix before further extraction.

### Phase 3: Renderer Component Decomposition

Goal: make UI features navigable.

Order:

1. Split `InstructionCard` because it has clearer subdomains.
2. Split `ConfigPanel` because it is larger and higher risk.
3. Split `AgentOutputPanel` and run console only after run-state contracts are stable.

Stop condition:

- If component props become noisy or duplicated, introduce a local view model or local context.

### Phase 4: Styling Split

Goal: make styling deletable.

Order:

1. Move tokens and base styles first.
2. Move command palette styles.
3. Move run console styles.
4. Move panel and form controls.
5. Delete unused selectors as components are split.

Stop condition:

- If visual regressions appear, add screenshot coverage for that UI before continuing.

### Phase 5: Plugin Fixture Modularization

Goal: keep generated consumer runtime maintainable.

Order:

1. Extract scoped test data helpers.
2. Extract storage state application.
3. Extract browser reuse.
4. Extract CDP mode.
5. Extract coverage handling.

Stop condition:

- If copied consumer projects break imports, keep compatibility shims and document the migration.

## Design Pattern Guidance

Use patterns only when they reduce complexity now:

- Facade: good for `ProjectService` or provider clients when hiding a messy external API.
- Strategy: good for auth strategies, provider transports, and run command strategies that already exist.
- Adapter: good for OpenCode HTTP/ACP/CLI and external tool APIs.
- State machine: good for pipeline/run lifecycle instead of scattered booleans.
- Repository: good for settings or persisted project data, not for every API call.

Avoid by default:

- Abstract factory without multiple concrete runtime implementations.
- Base classes for React components or providers.
- Generic event buses where direct function calls or typed stores are enough.
- Global service locators.

## Definition Of Done For Architecture Work

- The touched file is smaller or more cohesive than before.
- New module names explain their responsibility.
- Public contracts are typed and documented by usage.
- Existing behavior has a test or explicit verification command.
- No new generic `utils` bucket was created.
- No unrelated formatting churn was mixed into the change.
- The guidelines in `coding-guidelines.md` are followed or the exception is written down.

## Recommended First Pull Requests

1. Extract and test `runCommandResolver` and `directRunOptions` from `pipeline.ipc.ts`.
2. Extract `localAppManager` from `pipeline.ipc.ts`.
3. Extract OpenCode `model.ts` and `sessionApi.ts` from `opencode.ts`.
4. Split `InstructionCard` into source picker, selected source summary, preview, and fields.
5. Split `index.css` into `tokens.css`, `base.css`, and `command-palette.css` as the first styling slice.
