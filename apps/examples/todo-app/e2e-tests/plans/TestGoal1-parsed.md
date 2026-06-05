# Parsed Test Plan: @TestGoal1

## Source
- Input type: File
- Source file: `e2e-tests/data/migrations/files/SPECWRIGHT_TODO_SCENARIO_FOR_TESTING.md`
- Target app: `http://localhost:5174`
- Authentication: email/password

## Requested Module
- Preferred module/workflow name: `TodoCreation`
- Config module tag: `@TestGoal1`
- Category: `@Modules`

## Scenario Goal
Create and verify a high-priority todo in the Specwright Todo demo app.

## Preconditions
- User can sign in with email/password.
- Demo credentials are available through environment variables or the supplied scenario values.
- Todo list page is reachable after login.

## Test Data
- Title: generated unique test data
- Description: generated short description
- Priority: `High`
- Category: `Work`

## Functional Steps
1. Sign in with the demo user.
2. Open the todo list.
3. Click `New Todo`.
4. Fill `Title` with generated test data.
5. Fill `Description` with a short generated description.
6. Set `Priority` to `High`.
7. Set `Category` to `Work`.
8. Click `Create Todo`.
9. Verify the success message appears.
10. Verify the created todo appears in `My Todos`.
11. Verify the todo shows priority `High`.
12. Mark the todo complete.
13. Open the `Completed` filter.
14. Verify the completed todo is visible.

## Selector Guidance
- Prefer stable `data-testid` attributes where available.
- Discovery is required because the input file does not include concrete selectors.

## Expected Output
- Generate BDD coverage for creating a todo, priority `High`, category `Work`, and the `Completed` filter.
