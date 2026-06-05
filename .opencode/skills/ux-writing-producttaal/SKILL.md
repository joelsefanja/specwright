---
name: ux-writing-producttaal
description: >
  UI-copy, producttaal, microcopy, Nederlandse UX writing voor Specwright. Use when writing or reviewing any visible app text: buttons, headings, errors, empty states, onboarding, notifications, forms, tooltips, modals, desktop UI, web UI, docs UI, and product flows.
---

# UX Writing — Producttaal Skill

Gebruik dit skill voor alle zichtbare UI-teksten in Specwright, vooral in `apps/desktop` en `apps/web`.

## Wanneer gebruik je dit skill?

Gebruik dit skill bij elk verzoek dat gaat over:

- Schrijven of verbeteren van interface-teksten
- Knoppen, labels, titels, placeholders
- Foutmeldingen, waarschuwingen, succesmeldingen
- Onboarding flows, lege states, modals
- Notificaties, tooltips, bevestigingsdialogen
- Consistentiecheck van bestaande copy
- Tone of voice vragen voor een app of product

## 1. Toon & Stem

Voice is altijd hetzelfde. Tone verschuift per context.

```text
VOICE: helder, menselijk, actiegericht, respectvol
TONE: warm bij succes, neutraal bij instructie, rustig bij fouten
```

Stemkarakter:

| Eigenschap | Wel | Niet |
|---|---|---|
| Direct | "Sla op" | "Klik hier om op te slaan" |
| Menselijk | "Dat ging even mis" | "Er is een fout opgetreden" |
| Actiegericht | "Artikel toevoegen" | "Toevoegen" |
| Kort | Max. 5 woorden voor knoppen | Volzinnen in knoppen |
| Empathisch | Erken het probleem eerst | Direct schuld leggen bij gebruiker |

Toon per situatie:

| Situatie | Toon | Voorbeeld |
|---|---|---|
| Succes | Warm, bevestigend | "Opgeslagen" |
| Fout | Rustig, oplossingsgericht | "Dat lukte niet. Probeer opnieuw." |
| Waarschuwing | Neutraal, informatief | "Let op: dit kan niet ongedaan worden." |
| Lege state | Uitnodigend | "Nog geen artikelen. Voeg er een toe." |
| Laadscherm | Neutraal | "Even laden..." |
| Onboarding | Warm, motiverend | "Bijna klaar. Nog een stap." |
| Destructief | Kalm, direct | "Dit verwijder je permanent." |

## 2. Element-specifieke regels

### Knoppen

Regels:

- Altijd een werkwoord plus onderwerp wanneer dat past.
- Beschrijf het resultaat, niet de mechaniek.
- Max. 4 woorden, bij voorkeur 2 tot 3.
- Geen uitroeptekens.
- Primaire knop is de belangrijkste actie en moet het duidelijkst zijn.
- Destructieve knoppen nooit vaag houden.
- Gebruik gewone zinskapitalisatie, geen schreeuwerige uppercase.

Formule: `[Werkwoord] + [Object]`

Goede voorbeelden:

- Bestelling plaatsen
- Artikel toevoegen
- Wijzigingen opslaan
- Factuur downloaden
- Account verwijderen
- Bon afdrukken
- Wachtwoord instellen
- Koppeling verbreken
- Terug naar overzicht
- Inloggen

Slechte voorbeelden:

- Bevestigen
- Toevoegen
- Download
- Verwijderen
- OK
- Ja
- Nee
- Submit

Knoppenparen:

- Wijzigingen opslaan / Annuleren
- Account verwijderen / Behouden
- Afmelden / Aangemeld blijven

Vermijd:

- OK / Annuleren
- Ja / Nee

### Koppen

Regels:

- Beschrijf wat de gebruiker hier kan doen of ziet.
- Paginatitel is een zelfstandig naamwoord of korte frase.
- Modaltitel benoemt de actie.
- Max. 6 woorden.
- Geen marketingtaal in workflowkoppen.

Goede pagina- en sectiekoppen:

- Artikelbeheer
- Samengestelde artikelen
- Betalingsoverzicht
- Accountinstellingen
- Gebruikers en rechten

Goede modalkoppen:

- Artikel bewerken
- Account verwijderen?
- Wijzigingen opslaan?
- Koppelingen beheren

Vermijd:

- Welkom bij het systeem!
- Hier kun je je artikelen beheren
- Overzichtspagina voor betalingen

### Foutmeldingen

Gebruik deze formule:

1. Erken het probleem zonder technisch jargon.
2. Leg alleen uit wat misging als dat helpt.
3. Geef een uitweg of vervolgactie.

Regels:

- Geen technische foutcodes als primaire tekst.
- Leg de schuld niet bij de gebruiker.
- Geef altijd een actie of richting.
- Max. 2 zinnen.

Goede voorbeelden:

- Dat lukte niet. Probeer het opnieuw of neem contact op.
- Verbinding verbroken. Controleer je internet en laad opnieuw.
- Dit e-mailadres is al in gebruik. Log in of reset je wachtwoord.
- Vul een geldig bedrag in, zoals 12,50.
- Je sessie is verlopen. Log opnieuw in om verder te gaan.
- Dit artikel kan niet worden verwijderd. Het zit in een actieve bon.

Vermijd:

- Error 500: Internal Server Error
- Ongeldige invoer gedetecteerd.
- U heeft een fout gemaakt.
- Authenticatie mislukt.
- Actie niet mogelijk vanwege systeembeperkingen.
- Fout bij opslaan. [OK]

Inline validatie:

- Vul een e-mailadres in, zoals naam@bedrijf.nl
- Minimaal 8 tekens, waarvan 1 cijfer
- Dit veld is verplicht
- BTW-nummer klopt niet. Gebruik formaat NL123456789B01

### Succesmeldingen

Regels:

- Kort en bevestigend.
- Benoem wat er is gebeurd.
- Geen overdreven enthousiasme.
- Toast/snackbar max. 1 zin.

Goede voorbeelden:

- Artikel opgeslagen
- Wijzigingen bewaard
- Factuur verstuurd naar klant@bedrijf.nl
- Gebruiker toegevoegd aan het account
- Bon afgedrukt
- Koppeling verwijderd

Vermijd:

- Succes!
- De operatie is succesvol voltooid.
- Geweldig! Je hebt je artikel opgeslagen!
- OK

### Lege states

Gebruik deze formule:

1. Wat is leeg of waarom.
2. Wat kan de gebruiker doen.
3. Actieknop als dat helpt.

Goede voorbeelden:

- Nog geen artikelen. Voeg je eerste artikel toe om te beginnen. [Artikel toevoegen]
- Geen resultaten voor 'koffie'. Probeer een andere zoekterm of voeg een nieuw artikel toe. [Nieuw artikel]
- Nog geen gebruikers. Nodig teamleden uit om samen te werken. [Gebruiker uitnodigen]
- Geen betalingen gevonden in deze periode. Pas de datumfilter aan om andere periodes te bekijken.

Vermijd:

- Geen data beschikbaar.
- Lijst is leeg.
- Geen resultaten.
- Er zijn geen items om weer te geven.

### Notificaties en toasts

Regels:

- Toast is vluchtig, max. 1 zin.
- Notificatie is blijvend, max. 2 zinnen.
- Actie in toast alleen als cruciaal.
- Urgentie alleen als het echt urgent is.

Goede toastvoorbeelden:

- Opgeslagen
- Verwijderd. Ongedaan maken
- Niet gelukt. Probeer opnieuw.
- Uitgelogd

Goede notificaties:

- Je licentie verloopt over 3 dagen. Verleng je abonnement om toegang te houden.
- Nieuwe update beschikbaar. Herstart de app voor de laatste versie.

### Formulieren

Labels:

- Kort en beschrijvend.
- Geen instructiezin als label.
- Geen verplichte informatie alleen in placeholders.

Goede labels:

- Naam
- E-mailadres
- BTW-nummer
- Artikelprijs (excl. btw)
- Geldig tot

Placeholders:

- Gebruik als voorbeeld, niet als label.
- Houd ze kort.

Goede placeholders:

- naam@bedrijf.nl
- 12,50
- NL123456789B01
- Zoek artikel of barcode

Helptekst:

- Alleen als het de actie makkelijker maakt.
- Max. 1 zin.

### Modals en dialogen

Confirmatie bij onomkeerbare actie:

- Kop: `[Object] verwijderen?`
- Body: korte consequentie in 1 zin.
- Knoppen: destructieve actie en veilige uitweg.

Voorbeeld:

```text
Artikel verwijderen?

Dit artikel wordt permanent verwijderd en kan niet worden hersteld.

[Artikel verwijderen] [Annuleren]
```

Vermijd:

- Weet u zeker dat u wilt doorgaan met de geselecteerde actie?
- OK / Nee

Informatieve modal:

- Kop: wat je ziet of doet.
- Body: max. 3 zinnen.
- Knop: Begrepen, Sluiten, of specifieke actie.

### Onboarding en instructies

Regels:

- Een actie per stap.
- Gebruik je, niet u.
- Beschrijf het resultaat, niet de handeling.
- Toon voortgang bij meerdere stappen.

Goede voorbeelden:

- Stap 1 van 3 — Bedrijfsgegevens
- Bijna klaar. Controleer je e-mail om je account te activeren.
- Geen e-mail ontvangen? Verstuur opnieuw.

### Tooltips

Regels:

- Max. 1 tot 2 zinnen.
- Leg uit wat de UI zelf niet kan uitleggen.
- Herhaal niet wat al zichtbaar is.

Goede voorbeelden:

- Het verschil tussen inkoopprijs en verkoopprijs, uitgedrukt als percentage.
- Sla eerst je wijzigingen op.

Vermijd:

- Klik hier voor meer informatie
- Een tooltip die alleen het label herhaalt

## 3. Consistentieregels

Kies een term en gebruik die overal.

| Gebruik altijd | Niet door elkaar gebruiken |
|---|---|
| Artikel | Product / Item / SKU |
| Opslaan | Bewaren / Bevestigen |
| Verwijderen | Wissen / Weggooien / Deleten |
| Annuleren | Terug / Afbreken |
| Bewerken | Wijzigen / Aanpassen / Editen |
| Inloggen | Aanmelden / Signin |
| Uitloggen | Afmelden / Signout |

Schrijfconventies:

- Datums: 12 januari 2025 in lopende tekst.
- Bedragen: € 12,50.
- Percentages: 15%.
- Tijden: 14:30.
- Hoofdletters: alleen eerste letter van zin en eigennamen.
- Uitroeptekens: vermijden in interface-teksten.

## 4. Specwright producttaal

Gebruik deze termen in de desktopapp:

- Testdoel, niet klantactie.
- Projectmap, niet workspace als gebruikerswoord.
- App-link, niet website URL.
- Testmaker, niet model source.
- Login, niet sign-in flow.
- Test maken en draaien, niet generate/run pipeline.
- Teststudio voor de laatste stap.
- Specwright mag meekijken voor app-toegang.

Schrijf NL als primaire UI-copy. EN is toegestaan in technische of expliciet Engelstalige contexten.

Technische details, bestandsnamen, paden, logs en code mogen Engels of mono blijven.

## 5. Adversariële check

Controleer elke UI-tekst met deze vragen:

- Begrijpt een 12-jarige dit zonder uitleg?
- Staat er maximaal een actie in?
- Is het onder 5 woorden voor knoppen of 2 zinnen voor meldingen?
- Legt het de schuld niet bij de gebruiker?
- Is er een uitweg of vervolgactie?
- Staat er geen onnodig technisch jargon in?
- Past het bij de toon van de rest van de app?
- Klinkt het als een mens, niet als een systeem?

## 6. Outputformaat bij copy-review

Lever copy-reviews in dit formaat:

```text
ELEMENT: [knop / kop / fout / succes / lege state / tooltip / modal / etc.]
CONTEXT: [waar in de app, welke situatie]
ORIGINEEL: [bestaande tekst of leeg]
VERBETERD: [nieuwe tekst]
PRINCIPE: [welke regel/reden]
ALTERNATIEF: [optioneel]
```

Bij directe codewijzigingen hoef je dit format niet volledig uit te schrijven, maar gebruik dezelfde regels bij elke tekstkeuze.
