# Specwright README For Testing

This file is a plain-text friendly overview of Specwright. It is intended to be pasted into Specwright Desktop or selected as a text/file input so Specwright can generate tests for Specwright itself.

## What Specwright Is

Specwright is an AI-powered end-to-end test automation product. It helps teams turn a product idea, GitLab issue, local file, Jira ticket, or plain text scenario into production-grade Playwright BDD tests.

Specwright runs locally. It is designed for teams that want browser exploration, BDD generation, test execution, and self-healing without sending their app code to a SaaS test platform.

## Main Interfaces

Specwright has three main interfaces.

1. Specwright Desktop App

The desktop app is an Electron application for guided test creation. It is intended for QA engineers, developers, and product teams who want a visual workflow instead of only terminal commands.

2. Specwright Plugin

The plugin is installed into a target application with `npx @specwright/plugin init`. It scaffolds the Playwright BDD framework, Claude Code skills, agents, test utilities, example instructions, and test configuration.

3. Specwright MCP Server

The MCP server exposes Specwright tools to Claude Desktop. It provides E2E pipeline tools, project file tools, and integration points for browser automation and file conversion.

## Desktop App Features

### Guided Workflow

The desktop app guides the user through four main steps.

1. Choose project folder

The user selects the project where Specwright may save generated test files. Specwright remembers recent projects and lets the user change or disconnect the selected project.

2. Set app access

The user enters the app URL where the test should start. The app URL can come from environment files such as `e2e-tests/.env.testing` or `.env`. Specwright normalizes local URLs such as `localhost:4200` to `http://localhost:4200`.

The user can also configure login. Login is optional and should only be enabled when the scenario needs a signed-in test user. Supported access settings include email, password, OAuth-related values, storage keys, and visible login button selectors.

3. Describe scenarios

The user tells Specwright what should be tested. A scenario can come from:

- a GitLab issue;
- a local file;
- manual text written by the user.

GitLab issue input is the preferred default when the team works from GitLab. Assigned GitLab issues are shown first, and project-wide issues are secondary. A GitLab issue or file can be enough source context without manually writing every step.

4. Review and start

The user reviews the selected scenarios, project setup, app URL, source, and login state before starting. The run screen shows what Specwright will do, visible progress, live phases, latest activity, and result state. It should not feel magical or hidden.

### Run Feedback

When a run starts, Specwright shows progress in the app instead of relying on a separate terminal window. The user should see:

- which phase is active;
- which phases are complete;
- the latest readable activity from the run;
- whether the run is waiting, running, done, failed, or stopped;
- what to do next after success or failure.

If OpenCode is started by the app, it should run in the background without opening a separate terminal window. When the run is done or aborted, Specwright should clean up the OpenCode process it started.

### Pipeline Phases

The full pipeline has ten phases.

1. Initialization: read instructions and prepare the pipeline.
2. Detection and routing: choose input source such as GitLab, Jira, file, or text.
3. Input processing: convert source input into structured scenarios.
4. Exploration and planning: inspect the app in a browser and discover useful selectors.
5. Seed validation: validate discovered selectors with Playwright.
6. User approval: let the user review the plan before generating files.
7. BDD generation: create Gherkin feature files and step definitions.
8. Test execution and healing: run tests and fix failures when possible.
9. Cleanup: organize results and generated artifacts.
10. Final review: summarize quality, result, and next actions.

### Source Inputs

Specwright can start from several sources.

- GitLab issue: use issue title, description, labels, attachments, and project context.
- Jira issue: supported through MCP configuration when Atlassian is configured.
- Local file: use documents, CSV, JSON, PDF, screenshots, or other input files as source context.
- Manual text: describe the user task and expected visible result directly.
- Existing instructions.js: use structured test definitions in the plugin framework.

### GitLab Flow

The GitLab flow is designed for teams that start product work from issues.

Expected behavior:

- GitLab should be a prominent source option.
- Assigned issues should be easiest to access.
- Project-wide issues should still be available.
- The user can select an issue and use it as test context.
- Extra manual direction is optional when the issue already has enough detail.
- The review step should show which GitLab issue will be used.

### File Input Flow

The file input flow lets a user choose a source file as the starting point for a test. Specwright can use file content as scenario context. Through the MCP server, file conversion can support formats such as Markdown, PDF, Excel, Word, PowerPoint, CSV, HTML, images, and URLs.

### Manual Scenario Flow

The manual flow lets the user describe what the user does and what should visibly happen. A good scenario includes:

- where the user starts;
- what action the user performs;
- what visible result should be true;
- whether login is needed;
- whether the scenario is standalone or depends on earlier data.

### Local Browser Exploration

Specwright uses real browser automation to inspect the app. Exploration should discover UI elements, validate selectors, and produce seed files or test plans. Exploration should not rely only on guessed selectors.

### Test Output

Generated tests are stored in the target project under `e2e-tests/features/playwright-bdd/`.

Typical output structure:

```text
e2e-tests/features/playwright-bdd/
  @Modules/
    @Authentication/
      authentication.feature
      steps.js
    @Dashboard/
      dashboard.feature
      steps.js
  @Workflows/
    @UserJourney/
      @0-Precondition/
        setup.feature
        steps.js
      @1-Verify/
        verify.feature
        steps.js
  shared/
    auth.steps.js
    navigation.steps.js
    common.steps.js
```

### Desktop UI Features

The desktop app includes:

- calm guided workflow layout;
- workflow stepper with locked, active, done, running, and warning states;
- floating bottom action bar;
- setup checklist;
- scenario review;
- live progress and result feedback;
- activity rail with latest run logs;
- language switch between Dutch and English;
- UI scale controls;
- light theme optimized for readability;
- modal dialogs for login and advanced settings;
- visual design feedback overlay for improving UI through OpenCode;
- GitLab issue picker and source preview;
- local project selection and recent projects;
- no separate terminal window for app-started OpenCode sessions.

## Plugin Features

The Specwright plugin installs a full Playwright BDD framework into a web app.

Installed files include:

- `playwright.config.ts` with multi-project BDD configuration;
- `e2e-tests/instructions.js` for pipeline configuration;
- `e2e-tests/instructions.example.js` with examples;
- Playwright fixtures;
- authentication setup;
- generated seed test location;
- feature file directories;
- shared step definitions;
- test data utilities;
- Claude Code agents;
- Claude Code skills;
- project rules and conventions;
- MCP configuration.

### Playwright BDD

Specwright uses Gherkin `.feature` files compiled to Playwright tests through `playwright-bdd`.

Example:

```gherkin
Feature: User Authentication

  Scenario: Successful login flow
    Given I navigate to "Sign In"
    When I enter my email "user@example.com"
    And I click the proceed button
    And I enter my password
    And I click the login button
    Then I should be redirected to the home page
```

### Modules And Workflows

Specwright organizes tests into modules and workflows.

Modules are for one page or app area. They are independent and usually run in parallel.

Workflows are for cross-module user journeys. They can use a precondition feature that creates shared data, followed by consumer features that verify the result.

### Data Persistence

Specwright supports three layers of test data persistence.

1. Scenario data on the Playwright page.
2. In-memory feature data cache.
3. File-backed JSON data for cross-feature or worker-safe persistence.

### Declarative Form Handling

The plugin includes helpers such as `processDataTable` and `validateExpectations`.

Data tables use this format:

```gherkin
When I fill the form with:
  | Field Name | Value           | Type            |
  | Name       | <gen_test_data> | SharedGenerated |
  | Email      | <gen_test_data> | SharedGenerated |
```

`<gen_test_data>` creates test data. `<from_test_data>` reads previously stored test data.

### Authentication

Supported auth strategies include:

- `none` for public flows;
- `email-password` for form login;
- `oauth` for OAuth-like flows using stored browser state or localStorage.

Credentials and secrets should be stored in `.env.testing` or another local environment file, not hardcoded into tests.

### Test Running

Common plugin commands after installation:

```bash
pnpm test:bdd
pnpm test:bdd:all
pnpm test:bdd:auth
pnpm test:bdd:serial
pnpm test:bdd:workflows
pnpm test:bdd:debug
pnpm report:playwright
pnpm report:bdd
pnpm test:clean
```

Important rule: run `bddgen` before Playwright when invoking tests manually. Do not run plain `npx playwright test` against stale generated specs.

## MCP Server Features

The MCP server package is `@specwright/mcp`.

It exposes E2E tools for Claude Desktop and other MCP clients.

Main tools include:

- `e2e_setup` for guided setup;
- `e2e_automate` for the full pipeline;
- `e2e_configure` for instructions configuration;
- `e2e_explore` for browser exploration;
- `e2e_plan` for seed and plan generation;
- `e2e_generate` for BDD generation;
- `e2e_execute` for running tests;
- `e2e_heal` for fixing failing tests;
- `e2e_status` for pipeline status.

The MCP server also provides project-scoped file tools:

- `read_file`;
- `write_file`;
- `edit_file`;
- `list_directory`.

File paths are scoped to the configured project root to prevent traversal outside the project.

## Agent Runner Features

The agent runner package supports local AI execution paths used by the desktop app. It integrates with Claude Code style flows and AI SDK based providers.

Supported provider concepts include:

- OpenCode local;
- Anthropic Claude;
- OpenAI-compatible providers;
- Ollama local;
- optional base URL overrides for OpenRouter, Ollama, or custom providers.

Relevant environment variables:

```text
SPECWRIGHT_LLM_PROVIDER=opencode | anthropic | openai | ollama
SPECWRIGHT_MODEL=model-name
SPECWRIGHT_LLM_BASE_URL=https://example-provider
SPECWRIGHT_LLM_API_KEY=secret-api-key
SPECWRIGHT_PROJECT=/absolute/path/to/project
```

## Local Development

### Requirements

- Node.js 20.20.2 or newer.
- pnpm 9 or newer.
- Playwright browsers installed where needed.
- OpenCode, Claude Code, or another configured provider when using AI flows.

### Install Dependencies

From the repository root:

```bash
pnpm install
```

### Run All Development Servers

```bash
pnpm dev
```

This runs the monorepo development tasks through Turborepo.

### Run Desktop App Locally

```bash
pnpm --filter @specwright/desktop dev
```

or:

```bash
pnpm desktop
```

When the desktop app needs the agent runner build first:

```bash
pnpm --filter @specwright/agent-runner build
pnpm --filter @specwright/desktop dev
```

The root shortcut is:

```bash
pnpm dev:desktop:build
```

### Build Everything

```bash
pnpm build
```

### Build Desktop Only

```bash
pnpm --filter @specwright/desktop build
```

### Desktop Checks

```bash
pnpm --filter @specwright/desktop test:contrast
pnpm --filter @specwright/desktop test:e2e
pnpm --filter @specwright/desktop test:e2e tests/e2e/workflow-redesign-screenshots.spec.ts
```

### Package Desktop App

```bash
pnpm dist:mac
pnpm dist:win
pnpm dist:linux
```

### Build Agent Runner

```bash
pnpm --filter @specwright/agent-runner build
```

The agent runner uses CommonJS output and must be built before some desktop build or runtime flows can use it.

### Run Web Docs Locally

The docs site lives in `apps/web` and uses Next.js with MDX and Pagefind search.

Typical commands:

```bash
pnpm --filter @specwright/web dev
pnpm --filter @specwright/web build
```

### Example Apps

Specwright includes example apps for testing.

ShowBuff is a TV show discovery app with OAuth-like flows, watchlists, and favorites.

Todo App is a smaller CRUD demo app for simple E2E scenarios.

Useful examples:

```text
apps/examples/show-buff
apps/examples/todo-app
```

## Release And CI

Specwright uses pnpm and Turborepo.

CI uses:

```bash
pnpm install --frozen-lockfile
pnpm build
```

npm package releases use Changesets:

```bash
pnpm changeset
pnpm version-packages
pnpm release
```

Desktop releases are built from platform-specific distribution commands and release workflows.

## Important Product Rules

- Step files import `Given`, `When`, and `Then` from `fixtures.js`.
- Do not import BDD steps directly from `playwright-bdd` or `@playwright/test` in generated step files.
- `stepHelpers.js` is the source of field type behavior.
- `testDataGenerator.js` handles generated faker test data.
- The universal data table format is `Field Name`, `Value`, and `Type`.
- Seed files contain validated selectors from browser exploration.
- Generated feature paths follow `e2e-tests/features/playwright-bdd/{Category}/@{Module}/{FileName}.feature`.
- Agents are building blocks. Skills orchestrate the workflow.
- The UI should show feedback during long-running work instead of hiding progress.
- Desktop-started OpenCode work should not open a separate terminal window.

## Suggested Specwright Self-Test Scenarios

Use these scenarios when testing whether Specwright can generate useful tests from this README.

### Scenario 1: Desktop guided workflow is understandable

Start the Specwright desktop app. Verify the workflow has four visible steps: choose project folder, set app access, describe scenarios, and review/start. Verify each step has a clear title, description, and primary next action.

Expected result: the user can understand what to do next without reading technical logs.

### Scenario 2: User can configure a local app URL

Open the app access step. Enter a local app URL such as `localhost:5173`. Verify Specwright accepts or normalizes it as an app URL. Continue to the scenario step.

Expected result: the app URL is saved and the next step becomes available.

### Scenario 3: User can start from text input

Open the describe scenarios step. Choose manual text. Enter a short scenario: "User opens the home page and sees the main title, navigation actions, and status area." Continue to review.

Expected result: the review step shows the scenario and enables the run action when setup is complete.

### Scenario 4: User can start from GitLab issue

Open the describe scenarios step. Choose GitLab issue as source. Verify assigned issues are presented as the primary option, and project issues are secondary.

Expected result: selecting a GitLab issue makes it visible in review as the source for the test.

### Scenario 5: User can start from a file

Open the describe scenarios step. Choose file as source. Select this README file or another plain text file.

Expected result: Specwright treats the file content as scenario context and allows review/start when required setup is complete.

### Scenario 6: Review screen gives feedback before and after start

Open the review and start step. Verify the screen shows what Specwright will do before the run starts. Start the run.

Expected result: the screen shows live progress, active phase, latest activity, and a final result state. The user should not see only a spinner or hidden terminal output.

### Scenario 7: OpenCode runs without a terminal window

Configure the local provider as OpenCode. Start a run from the desktop app.

Expected result: no separate terminal window opens. Progress remains visible inside Specwright. When the run finishes or is aborted, the app cleans up the OpenCode process it started.

### Scenario 8: Stepper hover remains inside bounds

Move the mouse over each workflow step in the desktop stepper.

Expected result: the icon or number animation stays inside the step pill border and does not visually spill outside the rounded edge.

### Scenario 9: Plugin commands are discoverable

Read the local development and plugin sections. Verify a developer can find how to install the plugin, configure auth, run BDD tests, and open reports.

Expected result: the README contains enough information to start testing a target app locally.

### Scenario 10: MCP setup is discoverable

Read the MCP server section. Verify a user can identify the purpose of `@specwright/mcp`, the main `e2e_*` tools, project-scoped file tools, and required project path configuration.

Expected result: the README explains how MCP fits into Specwright without needing source code knowledge.

## Good Test Input Summary

If Specwright uses this file as source input, the best first generated test should verify the desktop guided workflow:

1. Start at the Specwright desktop app.
2. Choose or verify a project folder.
3. Set an app URL.
4. Add a scenario from text or this README file.
5. Review the scenario.
6. Start the run.
7. Confirm visible progress and final feedback.

The most important acceptance criterion is that Specwright should make test automation feel observable and reviewable, not magical.
