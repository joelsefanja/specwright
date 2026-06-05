# Desktop Simplification Plan

Specwright Desktop should feel like a guided workflow, not a control room. The current application exposes too many panels, settings, logs, options, and artifacts at the same time. That makes the product look powerful but difficult to understand, especially during a first demo.

This plan keeps the same capabilities while reducing visible complexity through an always-on workflow coach, contextual information, and progressive disclosure.

## Product Goal

Help a user generate and run a production-grade Playwright BDD test by guiding them through one clear path:

1. Connect project
2. Configure access
3. Describe test
4. Explore app
5. Review plan
6. Generate BDD
7. Run tests
8. Heal and review

The workflow is not a one-time onboarding screen. It is the permanent structure of the app. Users should always know where they are, what is required now, and what happens next.

## Current Problems

- The app shows too many regions at once: left settings, center generator, right templates, terminal output, logs, browser options, and report controls.
- Important workflow steps are implicit. Users must infer the order from labels and buttons.
- Configuration and execution concerns are mixed in the same panels.
- Advanced options are visible before users need them.
- Logs and debug details compete with primary task content.
- The same page tries to serve first-time users, advanced users, debugging, generation, execution, and reporting.
- Large UI files mirror the product problem: `ConfigPanel`, `InstructionCard`, and `AgentOutputPanel` each own multiple responsibilities.

## Design Principle

Use a narrowcasting model: show specific information to the specific user intent of the current step.

Each screen should answer only these questions:

- What step am I on?
- What does this step do?
- What input is needed from me?
- What is Specwright doing now?
- What is the next action?

Everything else moves behind contextual disclosure: `Advanced`, `Show details`, `View artifacts`, or `Open settings`.

## Target Layout

### 1. Workflow Coach

Always visible. This is the product spine.

Responsibilities:

- Show all workflow steps.
- Mark each step as locked, ready, active, running, done, warning, or error.
- Explain the active step in one or two sentences.
- Show the primary next action.

This replaces the need for users to understand the old panel layout.

### 2. Current Task

The main workspace only renders the current step.

Examples:

- Connect project: project picker, detected plugin status, one next button.
- Configure access: app URL, auth strategy, credentials status, test connection.
- Describe test: source picker and one focused test request editor.
- Explore app: browser/progress state and current exploration summary.
- Review plan: generated plan, approval controls, change request input.
- Generate BDD: generated files and progress.
- Run tests: run target, browser mode, results.
- Heal and review: failure summary, fixes, report link.

### 3. Activity And Artifacts

Collapsed by default.

Responsibilities:

- Terminal logs.
- Agent stream.
- Generated file links.
- Reports.
- Debug metadata.

This area should not compete with the active step. It should be easy to open when troubleshooting.

## What Moves Out Of Permanent View

- Model/provider settings move to `Advanced project settings`.
- Raw environment variables move to `Advanced project settings`.
- Test run flags move to the `Run tests` step.
- GitLab/Jira/source options move to the `Describe test` step.
- Generated artifacts move to the `Activity and artifacts` drawer.
- Logs become collapsed unless a run is active or failed.
- Template browsing becomes contextual to `Describe test`, not a permanent right panel.

## Proposed Component Model

```text
apps/desktop/src/renderer/src/workflow/
  workflowSteps.ts
  workflowState.ts
  WorkflowShell.tsx
  WorkflowCoach.tsx
  WorkflowWorkspace.tsx
  ActivityDrawer.tsx

apps/desktop/src/renderer/src/workflow/steps/
  ConnectProjectStep.tsx
  ConfigureAccessStep.tsx
  DescribeTestStep.tsx
  ExploreAppStep.tsx
  ReviewPlanStep.tsx
  GenerateBddStep.tsx
  RunTestsStep.tsx
  HealAndReviewStep.tsx
```

The old panels can be reused internally at first, but they should not remain the product architecture.

## Workflow State Model

Use a discriminated state model rather than loose booleans.

```ts
type WorkflowStepId =
  | "connect-project"
  | "configure-access"
  | "describe-test"
  | "explore-app"
  | "review-plan"
  | "generate-bdd"
  | "run-tests"
  | "heal-and-review";

type WorkflowStepStatus = "locked" | "ready" | "active" | "running" | "done" | "warning" | "error";
```

Derived selectors decide status from existing project/config/pipeline state. Do not duplicate persisted state unless needed.

## Migration Strategy

### Phase 1: Add Workflow Shell Without Removing Old UI

Goal: introduce the new structure safely.

Tasks:

- Add `workflowSteps.ts` and static step definitions.
- Add `WorkflowShell`, `WorkflowCoach`, `WorkflowWorkspace`, and `ActivityDrawer`.
- Render the current old Desktop UI inside `WorkflowWorkspace` as a compatibility placeholder.
- Keep behavior unchanged.

Verification:

- `pnpm --filter @specwright/desktop build`
- Manual smoke: app opens and current UI still works.

### Phase 2: Move Project Setup Into Workflow

Tasks:

- Create `ConnectProjectStep`.
- Move project picker and plugin detection summary out of `ConfigPanel`.
- Keep advanced project details collapsed.

Verification:

- Desktop build.
- Open project, detect plugin, show next ready state.

### Phase 3: Move Access Configuration Into Workflow

Tasks:

- Create `ConfigureAccessStep`.
- Move base URL, auth strategy, and credential status into the step.
- Move raw env variables behind `Advanced`.

Verification:

- Desktop build.
- Save `.env.testing` values.
- Run direct test with existing env.

### Phase 4: Move Test Description Into Workflow

Tasks:

- Create `DescribeTestStep`.
- Move source selection, instruction editor, GitLab/Jira source, and generation options into contextual sections.
- Keep advanced generation flags collapsed.

Verification:

- Desktop build.
- Create/edit instruction card.
- Preserve GitLab/Jira flows.

### Phase 5: Move Execution Into Workflow

Tasks:

- Create `ExploreAppStep`, `GenerateBddStep`, `RunTestsStep`, and `HealAndReviewStep`.
- Move run options out of permanent panels.
- Show logs in `ActivityDrawer`.

Verification:

- Desktop build.
- `/e2e-run` still works.
- Pipeline streaming still works.

### Phase 6: Remove Old Layout

Tasks:

- Remove permanent left/center/right panel assumptions.
- Delete unused panel code and CSS.
- Split `index.css` into layers and feature styles.

Verification:

- Desktop build.
- Manual visual smoke.
- Full workspace build.

## Parallel Subagent Plan

These slices can be built in parallel after Phase 1 creates the shell contracts.

### Subagent A: Workflow Shell

Scope:

- `apps/desktop/src/renderer/src/workflow/*`

Output:

- `workflowSteps.ts`
- `workflowState.ts`
- `WorkflowShell.tsx`
- `WorkflowCoach.tsx`
- `WorkflowWorkspace.tsx`
- `ActivityDrawer.tsx`

Rules:

- No behavior changes.
- No command construction in renderer.
- Components under 250 lines.

### Subagent B: Project And Access Steps

Scope:

- Workflow step components.
- Existing `ConfigPanel` extraction only when needed.

Output:

- `ConnectProjectStep.tsx`
- `ConfigureAccessStep.tsx`
- `AdvancedProjectSettings.tsx`

Rules:

- Preserve env read/write behavior.
- Keep raw env editing advanced.

### Subagent C: Test Description Step

Scope:

- Existing `InstructionCard` pieces.
- Source/template selection.

Output:

- `DescribeTestStep.tsx`
- `TestSourcePicker.tsx`
- `TestRequestEditor.tsx`
- `GenerationOptionsAdvanced.tsx`

Rules:

- Preserve instruction card data model first.
- Do not redesign GitLab/Jira behavior while moving it.

### Subagent D: Execution Steps

Scope:

- Existing pipeline event UI and run palette pieces.

Output:

- `ExploreAppStep.tsx`
- `ReviewPlanStep.tsx`
- `GenerateBddStep.tsx`
- `RunTestsStep.tsx`
- `HealAndReviewStep.tsx`

Rules:

- Renderer passes intent, main resolves command details.
- Logs and debug details go to `ActivityDrawer`.

### Subagent E: CSS And Visual Simplification

Scope:

- Desktop renderer styles only.

Output:

- `styles/tokens.css`
- `styles/base.css`
- `styles/layout.css`
- `styles/workflow.css`
- feature style files as needed.

Rules:

- Preserve import order.
- No broad visual rewrite until shell is functional.

## Acceptance Criteria

- A new user can understand the flow within 30 seconds.
- The app has one obvious primary action at every step.
- Advanced settings are available but not visually dominant.
- Logs and debug output do not compete with the task.
- The old feature set still works.
- No renderer component constructs shell commands.
- Files added for the new workflow stay below 250 lines.
- Full build passes.

## Non-Goals For The First Implementation

- No new AI capabilities.
- No new provider support.
- No redesign of generated BDD format.
- No removal of existing advanced settings until the workflow replacement is proven.
- No migration of persisted config formats unless strictly necessary.
