# GitLab To Test Flow Research

## Samenvatting

Deze map is de eerste pilot voor de Specwright Desktop UX-redesign workflow. De flow loopt van GitLab-issue naar testdoel, agent-run, outputreview en tests draaien.

De pilot combineert UI/UX-redesign met testbaarheid. Elke observatie moet uiteindelijk kunnen leiden tot acceptatiecriteria, integratiechecks of Electron e2e-tests.

## Inhoudsopgave

- [Doel](#doel)
- [Waarom Deze Flow](#waarom-deze-flow)
- [Bestanden](#bestanden)
- [Bestaande Testaanknopingspunten](#bestaande-testaanknopingspunten)
- [Werkregels](#werkregels)

## Doel

Onderzoeken hoe Specwright Desktop de gebruiker begeleidt bij:

1. Project kiezen.
2. GitLab-context ophalen.
3. Issue of bron selecteren.
4. Testdoel maken.
5. Agent laten runnen.
6. Output controleren.
7. Tests draaien of healen.

## Waarom Deze Flow

Deze flow raakt de kern van het gewenste ontwikkelproces:

- GitLab als bron van productwerk.
- Specwright als vertaler van issue naar testdoel.
- Agent-runner/OpenCode als uitvoerende laag.
- Playwright/Electron e2e als regressiebewaking.
- UI-feedback als input voor volgende verbetering.

## Bestanden

- `01-huidige-flow-audit.md`: Discover. Feitelijk vastleggen wat de huidige desktop flow doet.
- `02-frictiepunten.md`: Define. Frictie, risico's en prioriteit bepalen.
- `03-verbeterprincipes.md`: Develop. Small/medium/large richtingen zonder meteen te bouwen.
- `04-testplan.md`: Deliver/test. Acceptatiecriteria, testmatrix en e2e-scenario's.

## Bestaande Testaanknopingspunten

| Testbestand | Relevantie |
|---|---|
| `apps/desktop/tests/e2e/gitlab-integration-screenshots.spec.ts` | GitLab-auth, issue picker, selected issue en source preview. |
| `apps/desktop/tests/e2e/agent-run-feedback.spec.ts` | Agent-run feedback, foutdetails en layout-stabiliteit. |
| `apps/desktop/tests/e2e/run-tests-workflow.spec.ts` | Bootstrapped project en run-tests workflow. |
| `apps/desktop/tests/e2e/workflow-redesign-screenshots.spec.ts` | Visuele workflow-regressie. |
| `apps/desktop/tests/e2e/current-app-gallery.spec.ts` | Huidige schermgalerij voor audit en screenshots. |

## Werkregels

- Eerst observeren, dan pas verbeteren.
- Geen redesign zonder componentmapping.
- Geen feature zonder testintentie.
- Technische logs blijven beschikbaar, maar gebruikerssamenvatting staat voorop.
- Screenshottests gericht inzetten voor stabiele flow-states.
