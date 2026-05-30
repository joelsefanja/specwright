# Coding Guidelines

These guidelines are the default standard for this repository. Source code, comments, identifiers, documentation inside the codebase, and commit-facing technical language should be written in English.

The goal is boring, maintainable software: small files, clear boundaries, explicit names, predictable control flow, and changes that are easy to review.

---

## Core Principles

- Prefer clarity over cleverness. A straightforward solution that everyone can maintain beats a compact abstraction.
- Keep changes small and goal-driven. Every changed line should map to the current task.
- Optimize for reading. Code is read more often than it is written.
- Apply KISS first, DRY second. Duplication is acceptable until the shared concept is real and stable.
- Follow SOLID pragmatically. Do not introduce interfaces or classes just to satisfy a pattern.
- Use early returns and guard clauses to keep the happy path shallow.
- Avoid speculative configuration, compatibility layers, or extension points unless there is a current consumer.
- Do not mix orchestration, IO, parsing, domain decisions, and UI rendering in the same function or component.

---

## Architecture Boundaries

### Electron Desktop

- Main process code owns OS, filesystem, child processes, IPC registration, native dialogs, and app lifecycle.
- Renderer code owns UI, local UI state, visual composition, and user interactions.
- Preload code is the only bridge. Keep exposed APIs narrow and typed.
- IPC handlers should be thin. Move command resolution, env parsing, process management, and report detection into focused modules.
- Avoid long `*.ipc.ts` files. Split by capability, for example `test-runner`, `local-apps`, `agent-session`, `reports`, `permissions`.
- Never let renderer components know command-line construction details. Renderer passes intent; main process resolves execution.

### Agent Runner

- Provider adapters should translate between Specwright contracts and provider APIs only.
- Shared generation flow belongs outside individual providers.
- Keep transport concerns separate from protocol concerns. HTTP, SSE, CLI, and ACP should not be interleaved in one long function.
- Provider selection and environment parsing belong in the registry/config layer, not inside generation logic.

### Plugin Runtime

- `stepHelpers.js` remains the single source of truth for `FIELD_TYPES`.
- `testDataGenerator.js` remains the single source of truth for generated test data behavior.
- Step files import `Given`, `When`, `Then`, `Before`, `After`, and `expect` from `fixtures.js` only.
- Generated tests should prefer stable user-observable behavior over implementation details.
- Fixture changes must preserve normal Playwright behavior first. Special modes, such as CDP, must be explicit opt-in.

---

## File Size And Module Shape

- Target files under 250 lines.
- Treat files over 400 lines as refactor candidates.
- Treat files over 800 lines as architectural debt that needs an extraction plan.
- A file should have one primary reason to change.
- Extract by responsibility, not by syntax. Do not create a `utils.ts` dumping ground.
- Prefer feature folders with local helpers near their consumer.
- Keep public APIs small. Export only what another module actually uses.
- Avoid barrels when they hide dependency direction or create circular imports.

Good extraction targets:

- Pure parsing and normalization functions.
- Process spawning and lifecycle management.
- External API clients.
- UI subcomponents with independent state or layout.
- State selectors and derived view models.
- Reusable test fixtures or environment adapters.

Bad extraction targets:

- Single-use wrappers with vague names.
- Abstract base classes without multiple stable implementations.
- Generic helpers named `common`, `misc`, `utils`, or `helpers` without a domain noun.

---

## Naming

- Use English names everywhere.
- Use descriptive names. Avoid one-letter variables except conventional local coordinates or indexes in tiny scopes.
- File names should describe the thing they contain.
- Avoid suffixes unless they add real information. Keep `.spec` for tests.

```text
zone-editor.ts       not zone-editor.component.ts
fonts.ts             not fonts.service.ts, if it is a helper rather than an injectable service
```

- Event handlers start with `on`.

```ts
// Bad
(click)="zoneSelect.emit(zone)"

// Good
(click)="onZoneClick(zone)"
```

- Injected service properties must describe the service.

```ts
// Bad
private readonly storage = inject(SettingsService);

// Good
private readonly settingsService = inject(SettingsService);
```

- Injection tokens are `UPPER_SNAKE_CASE`.

```ts
export const ZONE_COMPONENTS = new InjectionToken<ZoneComponent[]>('Zone components');
```

- Library components use the `mpo` prefix. CSS classes use dashed-case.
- Prefer domain names over technical names: `resolveRunCommand` is better than `processInput`.
- Boolean names should read as predicates: `isRunning`, `hasAuth`, `canRetry`, `shouldStream`.

---

## TypeScript

- Prefer explicit return types for exported functions, public methods, IPC handlers, and async functions.
- Avoid `any`. If the shape is unknown, use `unknown` and narrow it.
- Avoid type assertions. Prefer type guards, schema validation, or typed APIs.
- Use `undefined` instead of `null` unless an external API requires `null`.
- Always use braces for control flow.
- Put `else` on a new line when it is needed. Prefer early return over `else` after a guard.
- Prefer `for...of` over `forEach`, especially for async code and better stack traces.
- Store repeated expressions in a named `const`.
- Use shorthand object notation.
- Keep filter predicates inline when they are trivial. Extract only if the predicate has a domain name and is reused.
- Use discriminated unions for state machines instead of loosely related booleans.
- Use `Record<string, unknown>` carefully. Prefer named types for cross-module contracts.

```ts
// Bad
function run(input: any) {
  if (input.enabled) {
    doWork(input.value);
  }
}

// Good
function run(input: RunInput): void {
  if (!input.enabled) {
    return;
  }

  doWork(input.value);
}
```

---

## Functions

- A function should do one thing at one level of abstraction.
- Prefer functions under 40 lines. Longer functions need a reason.
- Use guard clauses for invalid, empty, or unsupported cases.
- Keep the main path left-aligned.
- Avoid boolean parameters when they change behavior significantly. Use an options object or split the function.
- Avoid hidden side effects in functions that look like queries.
- Do not catch errors only to rethrow the same error.
- When catching errors, add context or recover intentionally.
- Name functions after the outcome, not the implementation detail.

```ts
// Bad
function handle(data: RawIssue): Issue {
  if (data.fields) {
    if (data.fields.title) {
      return mapIssue(data);
    }
  }
  throw new Error('Invalid issue');
}

// Good
function parseIssue(data: RawIssue): Issue {
  if (!data.fields?.title) {
    throw new Error('Issue title is required');
  }

  return mapIssue(data);
}
```

---

## Classes And Services

- Prefer functions and small modules until state or lifecycle makes a class useful.
- Classes should have one responsibility.
- Keep constructor work minimal. Start IO explicitly.
- Class members are ordered: `public` then `protected` then `private`.
- Keep inputs and outputs grouped.
- Methods follow the same order: public, protected, private.

```ts
export class MyComponent {
  public readonly type = input<string>();
  public readonly valueChanged = output<string>();

  protected readonly zones = this.zoneService.zones;

  private readonly settingsService = inject(SettingsService);

  public save(): void {
    // ...
  }

  protected onZoneClick(zone: Zone): void {
    // ...
  }

  private buildPayload(): Payload {
    // ...
  }
}
```

---

## React And Renderer Code

- Components should primarily render. Move command resolution, parsing, persistence, and IO into hooks or services.
- Split components when separate parts have separate state, effects, or responsibilities.
- Avoid `useMemo` and `useCallback` by default. Use them only for expensive work, stable dependencies required by a child, or existing project patterns.
- Effects synchronize with external systems. Do not use effects to derive state that can be computed during render.
- Prefer custom hooks for reusable UI behavior, not for hiding unrelated complexity.
- Zustand stores should expose focused actions and selectors. Avoid one store becoming an application service locator.
- Keep renderer state serializable where possible.
- Do not construct shell commands in React components.

---

## Angular, Signals, And Resources

- Do not use `this` in templates.
- Do not call getters or methods from templates. Use signals or computed values.
- A signal that never changes is a constant.
- Do not wrap signals in `params` unnecessarily. Pass the signal reference when possible.
- Store signal output in a local variable when it is read more than once.
- Always check `hasValue()` before `value()` in reactive contexts.
- Use `equal: compareObjects` for object-valued signals where supported.
- Expose `FormControl` values as signals instead of duplicating writable state.
- Use `rxResource` with `timer` for periodic fetching.
- Use `OnDestroy` when lifecycle cleanup is required.
- Use `HostListener` when component inputs need to be checked.
- Services should be provided at the narrowest useful scope.
- If a file creates no injectable state and only transforms data, it is a helper, not a service.

---

## Templates

- Keep templates declarative.
- Move multi-statement template logic into an event handler.
- HTML attributes go on new lines when the element becomes hard to scan.
- Attribute order: `class`, `[style]`, `[class]`, bindings, events.
- Use two spaces for indentation. Do not use tabs.
- Put `@else` on a new line.
- Use self-closing tags with a space before the slash.

```html
<mpo-carousel />
```

---

## CSS And SCSS

- Prefer design tokens and theme variables over literal colors.
- Keep CSS close to the component or feature when possible.
- Large global stylesheets must be split by layer: tokens, base, layout, components, utilities.
- Avoid unused styles. Delete styles when deleting the UI that uses them.
- Avoid selector chains that depend on deep DOM structure.
- Do not use `::ng-deep`. Use `:host`, component APIs, or explicit CSS variables.
- CSS class names are dashed-case and domain-specific.

---

## Error Handling And Logging

- Error messages should say what failed and include the relevant context.
- Do not swallow errors silently unless the operation is truly optional.
- Logs should be actionable. Avoid noisy logs in hot paths.
- Main-process logs should include the subsystem prefix.
- Do not log secrets, tokens, full auth payloads, or private user content.
- Prefer typed result objects for expected failures and exceptions for unexpected failures.

---

## Testing

- Tests should prove behavior, not implementation details.
- Add or update tests when changing command resolution, process management, provider behavior, fixtures, or generated-output contracts.
- Playwright assertions should prefer user-visible results and stable accessibility selectors.
- Avoid fallback assertions that can pass without proving the scenario.
- When adding a bug fix, reproduce the bug first where feasible.
- Keep test helpers small and named after user intent.

---

## Comments And Documentation

- Comments must be in English.
- Explain why, not what the next line already says.
- Prefer deleting misleading comments over updating around them.
- Public architecture decisions should live in `docs/`, not as long comments in code.
- If code needs a long comment to be understandable, consider extracting names or functions first.

---

## Review Checklist

Before opening or merging a change, check:

- Is the main path easy to read without jumping across many files?
- Did the change stay inside the right architectural boundary?
- Did any file exceed 400 lines or become noticeably more mixed in responsibility?
- Are names specific enough to understand intent without comments?
- Are invalid states impossible or guarded early?
- Are errors actionable and free of secrets?
- Are tests or verification commands included for behavior changes?
- Did you remove unused imports, types, functions, files, and CSS?
- Did you avoid adding abstractions with only one speculative consumer?

---

## Repository-Specific Rules

- Node must satisfy the repository engine: `>=20.20.2`.
- Use `pnpm` from the workspace root for installs and workspace commands.
- Do not run package installs from nested application folders.
- Keep `.gitignore` in the project root unless a nested repository explicitly requires its own.
- Generated or scaffolded plugin behavior must preserve existing consumer projects unless a migration is explicit.
- Desktop builds require `@specwright/agent-runner` to be built when packaging or testing packaged flows.
- `agent-runner` is CommonJS output; MCP server is ESM/plain JS. Do not blur module-system assumptions.
