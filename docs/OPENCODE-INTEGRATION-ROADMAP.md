# OpenCode Integration Execution Roadmap

## Goal

Reduce AI dependency and speed development by making OpenCode integration test-driven, deterministic, and recoverable. AI-backed execution should be the final layer on top of validated local checks, not the first signal that something works.

## Principles

- Build each slice with tests first: failing unit/integration test, implementation, passing test, then UI or pipeline wiring.
- Prefer deterministic checks over AI calls for readiness, validation, routing, and recovery decisions.
- Keep OpenCode optional unless the selected provider is `opencode`.
- Convert every OpenCode failure into structured state: status, logs, recovery action, and acceptance result.
- Do not rely on generated AI output to prove correctness; use fixtures, mocks, health probes, schema checks, and snapshot-free assertions.

## Phase 1: Contract And Test Harness

Implementation order:

1. Define shared OpenCode status and error contracts for main, preload, renderer, and pipeline use.
2. Add deterministic fixtures for missing CLI, invalid URL, unhealthy server, healthy server, failed attach, and successful attach.
3. Add test helpers that fake process spawning, health responses, and run-registry reads without calling OpenCode.

Tests:

- Unit tests for status normalization and error mapping.
- IPC/service tests using mocked command lookup, mocked HTTP health, and mocked process spawn.
- Type-level or schema tests that prevent renderer and main-process contract drift.

Non-AI deterministic checks:

- URL parsing with explicit accepted and rejected values.
- Command resolution result: found, missing, not executable.
- Health probe result: healthy, timeout, refused, malformed response.

Acceptance criteria:

- All OpenCode readiness states are represented by typed contracts.
- Tests run without OpenCode installed and without network access.
- No UI or pipeline code consumes raw process errors directly.

## Phase 2: Main-Process OpenCode Service

Implementation order:

1. Create one shared main-process service for provider detection, URL normalization, CLI lookup, health, start, stop, and attach.
2. Replace duplicated server-start logic in requirements, pipeline, and attach IPC with the shared service.
3. Return `{ ok: false, error }` results from all failure paths.

Tests:

- Service tests for invalid env URL, missing CLI, spawn failure, startup timeout, unhealthy server, and healthy server reuse.
- IPC tests asserting safe fallback responses for requirements, list, inspect, logs, diff, and attach.

Non-AI deterministic checks:

- Validate `SPECWRIGHT_OPENCODE_URL` once before use.
- Probe health before attach or pipeline execution.
- Verify session id shape before attach.

Acceptance criteria:

- Requirements checks never block setup-only flows because OpenCode is missing.
- OpenCode is required only when provider selection is `opencode`.
- Failed service operations produce stable error codes and recovery hints.

## Phase 3: Renderer Status And Recovery UI

Implementation order:

1. Add a Run preferences status card with states: `Ready`, `Not installed`, `Server not running`, `Invalid URL`, `No provider configured`, and `Attach failed`.
2. Add deterministic actions: `Check again`, `Start server`, `Copy install command`, `Copy attach command`, and `Open install docs`.
3. Keep raw errors behind details and show user-facing recovery copy first.

Tests:

- Renderer tests for every status state and action visibility.
- Desktop E2E fixture for failed attach showing a recoverable error without closing the panel.
- Smoke E2E for attach output, input, resize, and external terminal fallback.

Non-AI deterministic checks:

- Status card content is driven only by service status contracts.
- Action availability is derived from status codes, not AI text or logs.

Acceptance criteria:

- Users can understand and retry OpenCode failures without reading logs first.
- Attach failures keep the panel open and expose retry plus copy-command actions.
- The app never auto-installs OpenCode globally.

## Phase 4: Pipeline Gates Before AI Execution

Implementation order:

1. Add preflight gates before any AI-backed run: provider configured, required command available, URL valid, server healthy, project path valid, writable run directory.
2. Persist preflight results in `.specwright/runs/<id>` before starting OpenCode.
3. Fail fast with deterministic recovery guidance when a gate fails.

Tests:

- Pipeline tests for each failed preflight gate.
- Run-registry tests for persisted preflight status, logs, and safe read fallbacks.
- Regression test proving no OpenCode spawn happens when a deterministic gate fails.

Non-AI deterministic checks:

- File-system checks for run directory creation and log writability.
- Provider/env validation before spawning processes.
- Health check immediately before attach/start.

Acceptance criteria:

- AI/OpenCode execution starts only after all deterministic gates pass.
- Failed gates are visible in run details and logs.
- Registry failures return safe fallback UI data instead of crashing the renderer.

## Phase 5: Observability And Troubleshooting

Implementation order:

1. Log OpenCode startup, health, attach, preflight, and recovery events per run.
2. Add a troubleshooting bundle with command path, normalized base URL, health status, provider, session id, and last attach error.
3. Redact secrets before persistence or copy actions.

Tests:

- Log tests for event presence and ordering.
- Redaction tests for API keys, auth tokens, and full environment dumps.
- Bundle tests for missing fields and failed registry reads.

Non-AI deterministic checks:

- Secret redaction before writing logs.
- Bounded troubleshooting payload shape.
- No full env dump persistence.

Acceptance criteria:

- Support data is enough to diagnose OpenCode startup and attach issues without rerunning AI flows.
- Logs contain recovery-relevant events but no secrets.
- Troubleshooting bundles are stable across failed and successful runs.

## Implementation Order Summary

1. Contracts and deterministic fixtures.
2. Shared main-process service.
3. IPC replacement and safe fallback responses.
4. Renderer status and recovery UI.
5. Pipeline preflight gates.
6. Per-run observability and troubleshooting bundle.
7. Happy-path OpenCode smoke coverage after deterministic failure coverage is complete.
