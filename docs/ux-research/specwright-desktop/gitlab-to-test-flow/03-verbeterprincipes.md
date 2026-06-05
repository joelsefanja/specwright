# Verbeterprincipes

## Samenvatting

Dit document is de Develop-fase als research-output. Het benoemt mogelijke richtingen voor de GitLab-to-test flow, zonder implementatieopdracht.

## Small Richtingen

| Richting | Effect | Test |
|---|---|---|
| Duidelijkere next-step copy na issue-selectie. | Gebruiker weet wat er met het issue gebeurt. | E2E op zichtbare CTA en source summary. |
| Agent-output samenvatten boven technische logs. | Minder stress bij fouten. | E2E met mocked failed agent run. |
| Run-tests blockers eerder tonen. | Minder mislukte runs door setup. | E2E op readiness states. |

## Medium Richtingen

| Richting | Effect | Test |
|---|---|---|
| Source summary persistent tonen in testdoel-review. | Gebruiker behoudt context van GitLab issue. | E2E van issue picker naar review. |
| Agent activity drawer als timeline. | Gebruiker ziet voortgang zonder hoofdflow te verliezen. | E2E + screenshot voor key states. |
| OpenCode feedback reviewkaart. | Feedback op UI wordt concreet en controleerbaar. | E2E met localStorage/mock state. |

## Large Richtingen

| Richting | Effect | Test |
|---|---|---|
| UX Research tab naast E2E flow. | Specwright ondersteunt Discover/Define/Develop/Deliver expliciet. | Nieuwe e2e flow en documentgeneratie-tests. |
| GitLab-to-tests guided wizard. | Minder losse panels, sterkere procesbegeleiding. | Multi-step Electron e2e. |
| OpenCode-assisted app feedback loop. | Gebruiker selecteert UI, geeft feedback, agent maakt voorstel, tests draaien. | Integratietests + e2e met mocked agent/provider. |

## Componentmapping Eisen

Elke gekozen richting moet vooraf invullen:

| Vraag | Antwoord Nodig |
|---|---|
| Welke bestaande React componenten worden geraakt? | Bestandspaden en componentnamen. |
| Welke state/store wordt geraakt? | Zustand store, IPC of main-process service. |
| Welke copy verandert? | English source copy en Nederlandse reviewrichting indien relevant. |
| Welke test bewijst het? | Unit, integratie, Electron e2e of screenshot. |
| Welke regressie kan ontstaan? | Layout shift, projectstate, provider-fout, GitLab-fout, test-run fout. |
