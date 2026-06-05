# Todo Creation Scenario For Specwright Testing

Generate a practical Playwright BDD test for the Specwright Todo demo app.

## Target app

- Start URL: `http://localhost:5174`
- Login is required.
- Demo user: `demo@specwright.dev`
- Demo password: `Specwright2026!`

## Scenario

Create and verify a high-priority todo.

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

## Preferred output

- Generate a module or workflow named `TodoCreation`.
- Use stable selectors where available, especially `data-testid` attributes.
- The generated feature should mention creating a todo, priority `High`, and the `Completed` filter.
