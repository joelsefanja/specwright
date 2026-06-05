# Specwright UX Redesign And Test Workflow

## Samenvatting

Dit document vertaalt de MplusOnline research-first UX-aanpak naar Specwright zelf, met focus op de desktop app. Het doel is niet alleen een betere UI/UX, maar een workflow waarin elke verbetering ook testbaar wordt: agent-runs, GitLab-integratie, OpenCode-feedback, testgeneratie, integratietests en e2e-regressie.

Specwright moet de tool worden die zijn eigen ontwikkelproces ondersteunt: een gebruiker kan feedback geven op de UI, een agent kan aanpassingen voorstellen of uitvoeren, GitLab-context kan testdoelen leveren, en Playwright/Specwright-tests bewaken dat de flow blijft werken.

## Inhoudsopgave

- [Doel](#doel)
- [Waarom Dit Nu Past](#waarom-dit-nu-past)
- [North Star](#north-star)
- [Principes](#principes)
- [Double Diamond Voor Specwright Desktop](#double-diamond-voor-specwright-desktop)
- [Belangrijkste Productflows](#belangrijkste-productflows)
- [Feature En Testmatrix](#feature-en-testmatrix)
- [UI UX Redesign Criteria](#ui-ux-redesign-criteria)
- [Teststrategie](#teststrategie)
- [Eerste Pilot](#eerste-pilot)
- [Open Vragen](#open-vragen)
- [Slot](#slot)

## Doel

Specwright Desktop moet gebruikers begeleiden van idee of issue naar werkende, gevalideerde tests. De app moet niet voelen als een losse verzameling instellingen, panels en terminal-output, maar als een productieve flow:

1. Kies project en testdoel.
2. Haal context op uit GitLab, bestand, URL of handmatige instructie.
3. Laat een agent exploreren, plannen, genereren, draaien en healen.
4. Toon duidelijk wat de agent doet, wat gelukt is en waar controle nodig is.
5. Laat de gebruiker feedback geven op UI of output.
6. Zet feedback om naar een kleine verbetering of nieuw testdoel.
7. Bewaak regressie met integratie- en e2e-tests.

## Waarom Dit Nu Past

De huidige codebase bevat al de bouwstenen:

| Bouwsteen | Huidige Vindplaats | Betekenis Voor Deze Workflow |
|---|---|---|
| Desktop workflow | `apps/desktop/src/renderer/src/workflow/` | Basis voor begeleide stappen in plaats van losse panels. |
| Agent-run feedback | `apps/desktop/tests/e2e/agent-run-feedback.spec.ts` | Bewijst dat agentstatus en technische details testbaar zijn. |
| GitLab-integratie | `apps/desktop/tests/e2e/gitlab-integration-screenshots.spec.ts` | Bewijst dat issue-context en source preview testbaar zijn. |
| Run-tests flow | `apps/desktop/tests/e2e/run-tests-workflow.spec.ts` | Bewijst dat bootstrapped projecten en teststart regressie krijgen. |
| Workflow screenshots | `apps/desktop/tests/e2e/workflow-redesign-screenshots.spec.ts` | Kan gebruikt worden als visuele auditbasis. |
| UI componenten | `apps/desktop/src/renderer/src/components/ui/` | Basis voor consistente cards, buttons, fields, badges en surfaces. |
| Design tokens/styles | `apps/desktop/src/renderer/src/styles/` | Basis voor spacing, typography, motion, modals en workflow-layout. |
| Agent runner | `packages/agent-runner/` | Motor voor Claude/OpenCode/LLM-provider flows. |
| MCP server | `packages/mcp-server/` | Externe interface voor Claude Desktop en pipeline tools. |

Conclusie: de redesign-aanpak hoeft geen aparte tool naast Specwright te worden. Hij kan als productflow binnen Specwright Desktop worden uitgewerkt, met dezelfde research-first discipline als MplusOnline.

## North Star

Specwright helpt makers om van intentie naar betrouwbare tests te gaan zonder te verdwalen in tooling.

De desktop app moet daarom:

- Duidelijk maken waar de gebruiker is in de testgeneratieflow.
- Uitleggen wat een agent nu doet en wat de gebruiker daarna moet controleren.
- GitLab-issues, lokale instructies en handmatige feedback als gelijkwaardige bronnen behandelen.
- Feedback op UI en testoutput kunnen omzetten naar concrete vervolgstappen.
- Elke belangrijke productflow bewaken met tests die lokaal reproduceerbaar zijn.

## Principes

| Principe | Betekenis |
|---|---|
| Research first | Eerst bestaande flow auditen, dan frictie prioriteren, dan pas redesign of code. |
| Test first enough | Voor gekozen features eerst acceptatiecriteria en testintentie vastleggen. Niet alles vooraf bouwen, wel elk risico testbaar maken. |
| Agent transparency | Agent-output moet begrijpelijk zijn voor gebruikers; technische logs blijven beschikbaar maar niet dominant. |
| Local and private | Specwright blijft lokaal, zonder SaaS-afhankelijkheid of verborgen datastromen. |
| Small correct changes | UI-verbeteringen moeten klein genoeg zijn om te testen, reviewen en terug te draaien. |
| Workflow over widgets | De app moet taken begeleiden, niet alleen componenten mooier maken. |

## Double Diamond Voor Specwright Desktop

### 1. Discover

Doel: feitelijk begrijpen wat de huidige desktop flow doet.

Output per flow:

- Huidige-flow audit met route/scherm/stapbeschrijving.
- Componentinventaris: React componenten, stores, IPC, main-process services en testbestanden.
- Screenshotlijst uit bestaande e2e-screenshottests.
- Teksten, statuslabels, foutmeldingen en technische details.
- Bestaande tests en ontbrekende testdekking.

### 2. Define

Doel: frictie scherp maken en prioriteren.

Gebruik per issue:

| Veld | Betekenis |
|---|---|
| Observatie | Wat gebeurt er nu feitelijk? |
| Gebruikersrisico | Waar kan de gebruiker vastlopen, twijfelen of iets verkeerd begrijpen? |
| Productimpact | Raakt dit testgeneratie, agent-runs, GitLab, OpenCode feedback of settings? |
| Testbaarheid | Unit, integratie, Electron e2e, screenshot, handmatig. |
| Prioriteit | Hoog, midden, laag. |

### 3. Develop

Doel: meerdere oplossingen naast elkaar zetten.

Per probleem minimaal:

- Small: copy, helpertekst, status, layout spacing of button-label.
- Medium: andere stapvolgorde, summary panel, betere review state, duidelijke source preview.
- Large: nieuwe UX-module voor feedback-to-agent, GitLab-to-tests of OpenCode-assisted UI editing.

Elke variant moet componentmapping hebben:

| UI Deel | Bestaande Componenten | Mogelijke Aanpassing |
|---|---|---|
| Workflow frame | `WorkflowShell`, `WorkflowWorkspace`, `WorkflowStepFrame` | Stapcontext en status duidelijker maken. |
| Testdoel | `DescribeTestStep`, instruction-card componenten | Bronkeuze, source preview en acceptatiecriteria beter scheiden. |
| Agent-output | Agent output/feed componenten, feedback state | Begrijpelijke samenvatting boven technische logs. |
| Run tests | `RunTestsStep`, run-tests palette | Readiness, blockers en startactie explicieter maken. |
| Settings | LeftPanel modals, config store | Meer guided setup, minder losse instellingen. |

### 4. Deliver

Doel: gekozen verbetering beslisbaar en testbaar maken.

Output:

- Acceptatiecriteria.
- Testmatrix.
- E2E-scenario's of Playwright specs.
- Implementatiekaart met componenten en services.
- Regressierisico's.

## Belangrijkste Productflows

| Flow | Gebruikersdoel | Waarom Belangrijk |
|---|---|---|
| Project verbinden | Een lokaal project kiezen en laten herkennen. | Zonder projectcontext werkt niets betrouwbaar. |
| App link en login instellen | Base URL, auth en omgeving klaarzetten. | Testgeneratie valt of staat met toegang. |
| Testdoel beschrijven | Issue, bestand, URL of handmatige instructie omzetten naar scenario-intentie. | Dit is de brug tussen werkvraag en testoutput. |
| GitLab issue kiezen | Issues ophalen, previewen en als bron gebruiken. | Sluit aan op echte ontwikkelprocessen. |
| Agent laten runnen | Agent start, voortgang volgen, output begrijpen. | Kern van Specwright als AI-testtool. |
| User approval | Plan controleren voordat bestanden worden gegenereerd. | Voorkomt oncontroleerbare AI-output. |
| Tests genereren | Feature files en steps laten maken. | Hoofdwaarde van Specwright. |
| Tests draaien en healen | Fails herkennen, oorzaak tonen, herstel uitvoeren. | Bewaakt betrouwbaarheid. |
| UI-feedback op Specwright zelf | Feedback op de desktop app kunnen omzetten naar verbetering. | Maakt Specwright zelfverbeterend in het ontwikkelproces. |
| OpenCode integratie | OpenCode gebruiken om code/UI-aanpassingen te doen of te beoordelen. | Verbindt feedback, agent-run en implementatie. |

## Feature En Testmatrix

| Feature | Acceptatie | Minimale Testlaag | Bestaande Aanknoping |
|---|---|---|---|
| Agent-run status | Gebruiker ziet gestart, bezig, gelukt, controle nodig of fout zonder layout-shift. | Electron e2e + screenshot waar nuttig. | `agent-run-feedback.spec.ts` |
| Agent technische details | Technische foutdetails zijn beschikbaar, maar niet dominant. | Electron e2e. | `agent-run-feedback.spec.ts` |
| GitLab auth status | App toont of `glab` beschikbaar en geauthenticeerd is. | Electron e2e met fake `glab`. | `gitlab-integration-screenshots.spec.ts` |
| GitLab issue picker | Issues worden getoond met titel, status, assignee-context en source preview. | Electron e2e + screenshots. | `gitlab-integration-screenshots.spec.ts` |
| Source preview | Gebruiker kan acceptance criteria of issue-inhoud bekijken voordat testdoel wordt gemaakt. | Electron e2e. | `gitlab-integration-screenshots.spec.ts` |
| Project bootstrap detectie | Bootstrapped project opent zonder renderer recovery of initialization errors. | Electron e2e. | `run-tests-workflow.spec.ts` |
| Run tests readiness | App toont blockers voordat een test run gestart wordt. | Electron e2e + unit voor pure readiness logic indien aanwezig. | `RunTestsStep` en run-tests components. |
| Testgeneratie plan review | Gebruiker kan plan controleren voordat files worden geschreven. | E2E zodra flow stabiel is. | Pipeline phase 6 uit README. |
| OpenCode UI feedback | Feedback op geselecteerd UI-element kan worden opgeslagen, getoond en door agent verwerkt. | Electron e2e + mocked agent output. | Feedback state in `agent-run-feedback.spec.ts`. |
| OpenCode patch failure | Patch failures worden menselijk samengevat en technische details blijven inspecteerbaar. | Electron e2e. | `agent-run-feedback.spec.ts` |
| MCP/agent runner integration | MCP tools en agent-runner geven bruikbare output voor desktop. | Integratietest rond main-process service of CLI mock. | `packages/agent-runner`, `packages/mcp-server`. |
| Visual workflow regression | Belangrijkste schermen blijven visueel stabiel bij redesign. | Screenshot tests, beperkt en doelgericht. | `workflow-redesign-screenshots.spec.ts`, `current-app-gallery.spec.ts`. |

## UI UX Redesign Criteria

Gebruik deze criteria bij elk scherm voordat er code wordt aangepast:

| Criterium | Richtlijn |
|---|---|
| Spacing | Gebruik 4/8pt ritme. Binnen groepen minder ruimte dan tussen groepen. |
| Typografie | Maximaal drie zichtbare tekstniveaus per scherm: titel, sectie, body/help. |
| Status | Elke agent- of teststatus moet in gewone taal zichtbaar zijn. |
| Acties | Primaire knoppen benoemen uitkomst: bijvoorbeeld testdoel toevoegen, agent starten, tests draaien. |
| Technische details | Eerst samenvatting voor gebruiker, daarna uitklapbare logs/details. |
| Progressive disclosure | Geavanceerde settings en logs pas tonen wanneer nodig. |
| Broncontext | GitLab/file/manual input moet zichtbaar blijven als herkomst van het testdoel. |
| Foutpreventie | Blockers tonen voordat de gebruiker een run start. |
| Herstel | Foutmeldingen moeten zeggen wat de gebruiker of agent nu kan doen. |

## Teststrategie

| Laag | Wanneer Gebruiken | Voorbeelden |
|---|---|---|
| Unit | Pure mapping, labels, readiness-state, parser/logica. | Statuslabel mapping, GitLab issue normalization, run blockers. |
| Integratie | IPC, services, agent-runner, fake GitLab/OpenCode/MCP. | Main-process project service, mocked `glab`, mocked agent output. |
| Electron e2e | Echte desktop flows, layout, modals, localStorage/project state. | GitLab picker, run-tests workflow, agent feedback panel. |
| Screenshot | Visuele regressie voor stabiele schermdelen. | Workflow overview, GitLab states, feedback dialog. |
| Manual review | Nieuwe UX-richtingen voordat ze stabiel genoeg zijn voor screenshots. | Spacing, tone, flow clarity. |

Belangrijk: screenshottests moeten gericht blijven. Gebruik ze voor flow-states, niet voor elk detail van elke card.

## Eerste Pilot

Aanbevolen eerste Specwright-pilot:

```text
Flow: GitLab issue -> testdoel -> agent-run -> review output -> run tests
```

Waarom deze pilot:

- Hij raakt het echte ontwikkelproces.
- Hij combineert UI/UX, GitLab-integratie, agent-runner, OpenCode/agent feedback en testuitvoering.
- Er bestaan al e2e-aanknopingspunten.
- De flow is goed uitlegbaar aan gebruikers: van issue naar betrouwbare test.

Concrete Discover-output voor deze pilot:

- `docs/ux-research/specwright-desktop/gitlab-to-test-flow/01-huidige-flow-audit.md`
- `docs/ux-research/specwright-desktop/gitlab-to-test-flow/02-frictiepunten.md`
- `docs/ux-research/specwright-desktop/gitlab-to-test-flow/03-verbeterprincipes.md`
- `docs/ux-research/specwright-desktop/gitlab-to-test-flow/04-testplan.md`

Concrete testdoelen:

- GitLab auth required state blijft zichtbaar en begrijpelijk.
- Issue picker toont issues en assignee-context.
- Source preview toont acceptance criteria.
- Testdoel kan worden gekozen zonder projectstate te breken.
- Agent-run fout toont menselijke samenvatting plus technische details.
- Run-tests scherm toont readiness en blockers.

## Open Vragen

- Moet de UX-researchmodule zichtbaar worden in de desktop app, of voorlopig alleen in docs en agent-workflows blijven?
- Welke OpenCode-acties moeten vanuit Specwright Desktop gestart mogen worden: alleen voorstel maken, patch toepassen, tests draaien, of ook commit/branch voorbereiden?
- Welke GitLab-objecten zijn nodig naast issues: merge requests, epics, milestones, labels, pipelines?
- Moet Specwright Desktop testresultaten terugschrijven naar GitLab comments of alleen lokaal tonen?
- Welke features zijn must-have voor de eerste echte dogfood-run op Specwright zelf?

## Slot

De juiste richting is: Specwright Desktop redesignen als begeleide productflow en tegelijk elke gekozen verbetering koppelen aan testdekking. Daardoor wordt de UI beter, maar ook het ontwikkelproces sterker: feedback, agents, GitLab, OpenCode en Playwright werken dan samen in een controleerbare cyclus.
