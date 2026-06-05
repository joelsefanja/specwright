# Frictiepunten

## Samenvatting

Dit document is de Define-fase voor de GitLab-to-test flow. De huidige hypothese is dat de grootste frictie niet in losse componenten zit, maar in samenhang: gebruiker, GitLab-context, agentstatus, OpenCode-feedback en testuitvoering moeten als een duidelijke keten voelen.

## Top 3 Voorlopige Fricties

| Rang | Frictie | Waarom Belangrijk | Testbaarheid |
|---|---|---|---|
| 1 | De gebruiker moet altijd begrijpen wat de volgende stap is na issue-selectie of agent-output. | Zonder duidelijke next step voelt AI-output vrijblijvend of oncontroleerbaar. | Electron e2e op zichtbare CTA/status. |
| 2 | Agent-fouten en patch-fouten moeten menselijk worden samengevat. | Technische logs zijn nodig, maar mogen niet de primaire UX zijn. | Bestaand: `agent-run-feedback.spec.ts`. |
| 3 | GitLab-source context moet zichtbaar blijven tot aan testgeneratie. | Anders verliest de gebruiker vertrouwen dat het juiste issue getest wordt. | Bestaand: `gitlab-integration-screenshots.spec.ts`; uitbreiden naar testdoel-review. |

## Frictieclusters

| Cluster | Mogelijke Frictie | Impact |
|---|---|---|
| Bronkeuze | GitLab, file, manual input en URL kunnen als losse opties voelen. | Gebruiker weet niet welke bron beste is. |
| Status | Agent/pipeline/teststatus kan technisch of versnipperd zijn. | Gebruiker weet niet of hij moet wachten, reviewen of herstellen. |
| Feedback | UI-feedback op Specwright zelf moet niet verdwijnen in technische logs. | Zelfverbetering wordt moeilijk te volgen. |
| Testuitvoering | Readiness en blockers moeten vooraf helder zijn. | Tests falen door setup in plaats van productgedrag. |
| Integraties | GitLab, OpenCode, MCP en agent-runner hebben elk eigen foutmodi. | Fouten voelen onvoorspelbaar zonder herstelpad. |

## Nog Te Valideren

- Welke next-step CTA's ontbreken in de huidige UI?
- Welke technische logs zijn nuttig voor gebruikers en welke alleen voor developers?
- Hoeveel GitLab-context moet zichtbaar blijven in latere stappen?
- Welke OpenCode-acties mogen automatisch, en welke vragen expliciete approval?
- Welke flows moeten screenshot-stabiel zijn en welke niet?
