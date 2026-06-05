# Testplan

## Samenvatting

Dit document vertaalt de GitLab-to-test UX-pilot naar testbare acceptatie. Het doel is dat elke toekomstige redesign-stap kan worden bewezen met passende testlagen.

## Acceptatiecriteria

| Nr | Acceptatiecriterium | Testlaag |
|---|---|---|
| 1 | Als GitLab-auth ontbreekt, ziet de gebruiker een duidelijke melding en herstelrichting. | Electron e2e met fake `glab`. |
| 2 | Als GitLab-auth werkt, ziet de gebruiker issues uit de repo met voldoende context. | Electron e2e. |
| 3 | Als een issue gekozen is, blijft zichtbaar welk issue de bron is. | Electron e2e + eventueel screenshot. |
| 4 | De source preview toont acceptance criteria of issue-inhoud voordat agent-run start. | Electron e2e. |
| 5 | Een agent-run fout toont een menselijke samenvatting zonder layout shift. | Electron e2e. |
| 6 | Technische details zijn beschikbaar via disclosure, niet direct dominant. | Electron e2e. |
| 7 | Run-tests scherm toont readiness en blockers voordat tests starten. | Electron e2e + unit voor readiness logic waar mogelijk. |
| 8 | Een bootstrapped project opent zonder renderer recovery. | Bestaand Electron e2e. |

## Bestaande Tests

| Bestand | Behouden / Uitbreiden |
|---|---|
| `apps/desktop/tests/e2e/gitlab-integration-screenshots.spec.ts` | Behouden; uitbreiden wanneer source summary later doorloopt naar review/run. |
| `apps/desktop/tests/e2e/agent-run-feedback.spec.ts` | Behouden; uitbreiden voor OpenCode UI-feedback states. |
| `apps/desktop/tests/e2e/run-tests-workflow.spec.ts` | Behouden; uitbreiden voor readiness/blocker varianten. |
| `apps/desktop/tests/e2e/workflow-redesign-screenshots.spec.ts` | Alleen gebruiken voor stabiele workflow-states. |

## Nieuwe Testideeen

| Testidee | Waarom |
|---|---|
| GitLab issue naar testdoel review | Bewijst dat broncontext niet verdwijnt. |
| OpenCode feedback approval state | Bewijst dat UI-feedback controleerbaar blijft voordat patch wordt toegepast. |
| Agent provider unavailable state | Bewijst dat providerfouten herstelbaar zijn. |
| MCP/tooling recommendation state | Bewijst dat setup-hulp begrijpelijk blijft. |
| Run-tests blocker matrix | Bewijst dat ontbrekende scripts/configs vooraf worden uitgelegd. |

## Niet Over-Testen

- Geen screenshots voor elke kleine spacingwijziging.
- Geen live GitLab-calls in e2e; gebruik fake `glab` of fixtures.
- Geen echte LLM-calls in desktop e2e; mock agent-output.
- Geen tests die afhankelijk zijn van globale projectstate zonder isolated `userDataDir`.

## Eerste Uitvoerbare Volgende Stap

Kies een kleine verbetering in de GitLab-to-test flow en voeg eerst een e2e-verwachting toe die het gewenste gedrag beschrijft. Pas daarna de UI aan.
