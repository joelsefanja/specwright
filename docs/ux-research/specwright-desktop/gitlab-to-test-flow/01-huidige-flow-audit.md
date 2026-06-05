# Huidige Flow Audit

## Samenvatting

Dit document is de Discover-fase voor de Specwright Desktop flow van GitLab-issue naar testdoel en testuitvoering. De audit moet feitelijk vastleggen wat de huidige app doet, welke componenten en services betrokken zijn, welke e2e-tests al bestaan en waar de gebruiker status of context ziet.

## Inhoudsopgave

- [Startpunt](#startpunt)
- [Double Diamond Fase](#double-diamond-fase)
- [Huidige Flow](#huidige-flow)
- [Componenten En Services](#componenten-en-services)
- [Huidige Tests](#huidige-tests)
- [Nog Te Observeren](#nog-te-observeren)

## Startpunt

App: `apps/desktop`.

Belangrijke bestaande testbestanden:

- `apps/desktop/tests/e2e/gitlab-integration-screenshots.spec.ts`
- `apps/desktop/tests/e2e/agent-run-feedback.spec.ts`
- `apps/desktop/tests/e2e/run-tests-workflow.spec.ts`

## Double Diamond Fase

Fase: Discover.

Doel:

- Beschrijven wat de flow nu doet zonder al een oplossing te kiezen.
- Componenten, stores, IPC-services, agent-runner en e2e-tests koppelen.
- UI-copy, statuslabels, fouten en technische details verzamelen.

## Huidige Flow

Voorlopige flow op basis van code- en testobservatie:

1. Desktop app opent met projectcontext.
2. Gebruiker kiest of configureert project/app/login.
3. Gebruiker gaat naar `Describe test goal`.
4. GitLab-context kan issues tonen wanneer `glab` beschikbaar en geauthenticeerd is.
5. Gebruiker selecteert een issue.
6. Source preview toont issue-inhoud of acceptance criteria.
7. Testdoel wordt voorbereid voor agent/pipeline.
8. Agent-run geeft status, output en eventueel technische details.
9. Run-tests flow controleert of project klaar is om tests te draaien.

## Componenten En Services

| Onderdeel | Vindplaats | Rol |
|---|---|---|
| Workflow shell | `apps/desktop/src/renderer/src/workflow/` | Begeleide desktop workflow. |
| Describe test step | `apps/desktop/src/renderer/src/workflow/steps/DescribeTestStep.tsx` | Testdoel en bronkeuze. |
| Instruction cards | `apps/desktop/src/renderer/src/components/CenterPanel/instruction-card/` | Weergave en configuratie van testinstructies. |
| Run tests step | `apps/desktop/src/renderer/src/workflow/steps/RunTestsStep.tsx` | Readiness en testuitvoering. |
| Left panel config | `apps/desktop/src/renderer/src/components/LeftPanel/` | Project, URL, auth, OpenCode/config settings. |
| Stores | `apps/desktop/src/renderer/src/store/` | Pipeline-, config- en instruction-state. |
| Main IPC | `apps/desktop/src/main/ipc/` | Brug tussen renderer en main process. |
| Project services | `apps/desktop/src/main/services/` en `apps/desktop/src/main/project/` | Projectdetectie en projectfiles. |
| Agent runner | `packages/agent-runner/` | Agent-uitvoering en providerintegraties. |

## Huidige Tests

| Test | Wat Wordt Al Bewezen |
|---|---|
| `gitlab-integration-screenshots.spec.ts` | Auth-required state, issue picker, selected issue, source preview. |
| `agent-run-feedback.spec.ts` | Foutstatus, menselijke output, technische details, layout blijft stabiel. |
| `run-tests-workflow.spec.ts` | Bootstrapped project opent zonder renderer recovery en toont run-tests workflow. |

## Nog Te Observeren

- Exacte schermvolgorde in de huidige desktop app met screenshots.
- Welke labels en helpteksten verwarring veroorzaken.
- Welke states van GitLab, OpenCode en agent-runner nog geen test hebben.
- Of source preview duidelijk genoeg maakt wat straks getest wordt.
- Of run-tests blockers vroeg genoeg zichtbaar zijn.
