---
name: ui-design-spacing
description: >
  Gebruik dit skill bij elk verzoek over spacing, visual hierarchy, typografie, fonts, look & feel, of design-beslissingen in webapps en interfaces. Triggers zijn vragen over: ruimte tussen elementen, padding/margin, typografische schaal, welk font kiezen, font-combinaties, kleurkeuze, component-stijl, theming, consistentie, of "waarom ziet dit er rommelig/druk/vlak uit". Gebruik ook bij het reviewen van bestaande UI, het ontwerpen van nieuwe schermen, of het vertalen van designbeslissingen naar code. Werkt voor elk framework of platform. Als Angular Material aanwezig is of vermeld wordt, heeft dat STERKE voorkeur boven generieke CSS-oplossingen.
---

# UI Design — Spacing, Typografie, Fonts & Visual Hierarchy

## Wanneer gebruik je dit skill?

Bij elk verzoek over:

- Spacing, padding, margin, witruimte tussen componenten
- Fonts kiezen, font-combinaties, typografische schaal
- Kleurgebruik, theming, design tokens
- Visuele hiërarchie: "dit scherm voelt druk/chaotisch/vlak"
- Consistentie checks in bestaande UI
- Look & feel vragen: kaartjes, lijsten, formulieren, dashboards

Framework-prioriteit:
Als in de context Angular + Angular Material aanwezig is, gebruik altijd de Angular Material implementatie. Geef bij twijfel altijd een generieke en een Angular Material variant.

## 1. Fonts — Kiezen, Combineren, Weglaten

### Stap 1: Wanneer heb je een custom font nodig?

Dit is de eerste vraag: niet welk font, maar of een custom font nodig is.

| Situatie | Gebruik |
|----------|---------|
| Backoffice / data-dense tool | System font stack: sneller, geen FOUT, native gevoel |
| Consumentenapp met eigen identiteit | 1 tot 2 custom fonts via Google Fonts of variable font |
| Marketing-/landingspagina | Custom fonts: merkpersoonlijkheid telt hier het meest |
| Prototype / MVP | System font: geen tijd investeren in iets wat nog verandert |
| PWA die native-app-gevoel moet hebben | System font stack: voelt als het OS |

System font stack:

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
               'Noto Sans', Helvetica, Arial, sans-serif;
}

body {
  font-family: system-ui, sans-serif;
}
```

Wanneer custom font wel de moeite waard is:

- Je bouwt iets waarvoor visuele identiteit telt.
- Je wilt onderscheidend zijn ten opzichte van generieke tools.
- Het font is een variable font: een bestand, meerdere gewichten.

Hard maximum: nooit meer dan 2 font-families per project. Gebruik gewicht-variaties voor hiërarchie binnen dezelfde familie.

### Stap 2: Font-categorieën begrijpen

| Categorie | Karakter | Gebruik |
|-----------|----------|---------|
| Sans-serif | Modern, neutraal, schermvriendelijk | Body, UI-tekst, labels |
| Serif | Klassiek, gezaghebbend, warm | Koppen op editorial/marketing, bodytekst in langere leesstukken |
| Geometric sans | Helder, strak, technisch | SaaS, dashboards, tech-producten |
| Humanist sans | Vriendelijk, leesbaar, open | Consumentenapps, onboarding |
| Monospace | Code, data, nauwkeurigheid | Technische tools, code-editors, prijzen/nummers |
| Display/slab | Expressief, karakter | Alleen koppen, nooit bodytekst |

### Stap 3: Font-combinaties bedenken

Basisregels:

1. Contrast: twee fonts moeten verschillen in categorie, gewicht of stijl.
2. Harmonie: ze moeten samen een systeem vormen, niet concurreren.

Beproefde combinatieformules:

```text
Serif kop + Humanist sans body    -> warm, editorial, toegankelijk
Geometric sans kop + Serif body   -> modern + karakter, werkt voor SaaS
Bold weight kop + Regular body    -> een familie, twee gewichten
Display kop + Neutrale sans body  -> expressief, alleen voor marketing
```

Veiligste aanpak: superfamily of een familie met meerdere gewichten.

- Fraunces Display + Fraunces Text
- Playfair Display + Playfair
- Plus Jakarta Sans in meerdere gewichten

### Stap 4: Tools gebruiken

Gebruik altijd een tool om font-paren te valideren.

| Tool | Wat het doet | Wanneer |
|------|-------------|---------|
| fontjoy.com | AI genereert paren; slider van vergelijkbaar naar hoog contrast | Verkennen, inspiratie, snel vergelijken |
| fontpair.co | Gecureerde Google Fonts-paren | Snel betrouwbaar paar vinden |
| typescale.com | Previewt font op schaal met echte groottes | Valideren of het paar werkt op scherm |
| typewolf.com | Fonts in echte live websites | Inspiratie in context |
| fonts.google.com | Pairings tab per font | Startpunt bij Google Fonts |

Workflow:

1. Bepaal de toon van je product.
2. Zoek op Fontjoy of Fontpair.
3. Valideer op Typescale.
4. Check Typewolf voor vergelijkbare producten.
5. Implementeer met `display: swap` en laad alleen benodigde weights.

### Stap 5: Font-keuze valideren

Controleer:

- Leesbaar op 14px zonder anti-aliasing issues.
- Minimaal 400 en 600 of 700 beschikbaar.
- Werkt op licht en donker kleurvlak.
- Liefst variable font.
- Werkt op Windows en macOS.
- Licentie geschikt voor web/app/commercieel gebruik.
- Maximaal 2 families geladen.

### Bewezen font-paren voor UI

Neutraal / backoffice / SaaS:

```text
Inter + Inter
Plus Jakarta Sans + Lora
Work Sans + Source Serif 4
```

Consumentenapp / product:

```text
Outfit + Lato
DM Sans + DM Serif Display
Nunito + Merriweather
```

Expressief / marketing / eigen product:

```text
Fraunces + Cabinet Grotesk
Clash Display + Satoshi
Playfair Display + Raleway
```

Monospace accent:

```text
JetBrains Mono of Fira Code
```

## 2. Spacing — Het Fundament

### Het 8pt / 4pt systeem

Gebruik altijd multiples van 4 of 8.

```text
4px   micro: iconspacing, kleine gaps binnen component
8px   xs: tight padding, afstand label naar value
12px  sm: interne component padding
16px  md: standaard padding in cards, list items, form fields
24px  lg: afstand tussen secties binnen container
32px  xl: afstand tussen losse componenten / cards
48px  2xl: sectie-scheiding op paginaniveau
64px  3xl: hero-ruimte, grote visuele pauzes
```

Definieer als CSS custom properties:

```css
:root {
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;
}
```

Belangrijkste regel: intern kleiner of gelijk aan extern.

Ruimte binnen een groep is altijd kleiner dan ruimte tussen groepen.

### Proximity = verwantschap

Elementen die dicht bij elkaar staan worden als verwant gezien. Gebruik dit in plaats van borders.

```scss
.form-section {
  margin-bottom: var(--space-xl);

  .form-field + .form-field {
    margin-top: var(--space-sm);
  }
}
```

## 3. Typografische Hiërarchie

Maximaal 3 niveaus per scherm:

```text
Niveau 1 — Paginatitel       32-28px, weight 600-700
Niveau 2 — Sectie/kaarttitel  22-18px, weight 500-600
Niveau 3 — Bodytekst         16-14px, weight 400
           Helptekst         12px, lagere opacity
```

Contrast zonder grote font-sizes:

- Gewicht: 500 vs 400 is al merkbaar.
- Kleur/opacity: primary text vs secundair op 60%.
- Grootte: 14 naar 16px is genoeg.

Basisregels:

```css
body { font-size: 16px; line-height: 1.5; }
p { max-width: 65ch; }
h1 { font-size: clamp(1.5rem, 1rem + 2vw, 2.5rem); }
```

### Material 3 Type Scale

```text
Headline Large   32px  — paginatitels
Headline Medium  28px  — sectietitels
Headline Small   24px  — kaarttitels, modaltitels
Title Medium     16px medium — lijsttitels, tabel-headers
Body Large       16px  — primaire bodytekst
Body Medium      14px  — secundaire bodytekst
Body Small       12px  — helptekst, captions
Label Large      14px  — knoppen
Label Medium     12px  — tabs, chips
```

Angular Material tokens:

```scss
h1          { font: var(--mat-sys-headline-large); }
h2          { font: var(--mat-sys-headline-medium); }
.card-title { font: var(--mat-sys-title-medium); }
.help-text  { font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface-variant); }
```

Font instellen in Angular Material:

```scss
@use '@angular/material' as mat;

html {
  @include mat.theme((
    color: (primary: mat.$blue-palette),
    typography: (
      plain-family: 'Plus Jakarta Sans',
      brand-family: 'Fraunces',
    ),
  ));
}
```

## 4. Kleursysteem & Tokens

Gebruik semantische lagen. Geen hardcoded kleuren in component-CSS.

```css
.status-badge {
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
}
```

Angular Material M3 kleurrollen:

| Element | Achtergrond | Tekst |
|---|---|---|
| Primaire actie-knop | `--mat-sys-primary` | `--mat-sys-on-primary` |
| Geselecteerde rij/item | `--mat-sys-primary-container` | `--mat-sys-on-primary-container` |
| Waarschuwing/error | `--mat-sys-error-container` | `--mat-sys-on-error-container` |
| Subtiele kaart | `--mat-sys-surface-variant` | `--mat-sys-on-surface-variant` |
| Disabled | `--mat-sys-on-surface` 38% | — |
| Helptekst | — | `--mat-sys-on-surface-variant` |

Angular Material overrides altijd via API:

```scss
html {
  @include mat.card-overrides((
    elevated-container-color: var(--mat-sys-surface-variant),
    elevated-container-shape: 12px,
  ));
}
```

Elevation:

```text
level0  geen schaduw
level1  subtiel: kaarten
level2  licht: actieve kaart
level3  medium: dialogen
level5  zwaar: kritieke overlays
```

## 5. Visuele Hiërarchie

De 5 tools:

1. Grootte: groter is eerder gezien.
2. Contrast: verschil in kleur, gewicht, helderheid.
3. Witruimte: meer ruimte rondom is meer belang.
4. Proximity: dicht is verwant, ver is onverwant.
5. Alignment: consistente uitlijning geeft structuur.

Scan-patronen:

- F-patroon: tabellen, data-dense schermen.
- Z-patroon: overzichtsschermen.

Actieplaatsing:

- Primaire actie in formulieren rechtsonder of naast het actieblok.
- Destructieve actie nooit prominent.
- Status/context boven de fold, linkerkolom.

## 6. Look & Feel Patronen

Generiek:

- Kaarten: padding 16px compact of 24px ruim; radius 8 tot 12px; schaduw level 1.
- Formulieren: een veldtype consequent; labels boven veld; foutmelding inline onderaan.
- Knoppen: min touch target 44x44px mobiel, 36px desktop; primair gevuld, secundair outline.
- Tabellen: rijhoogte 48 tot 56px; sortering en paginering bij meer dan 10 rijen.

Angular Material specifiek:

```scss
@include mat.all-component-densities(-1);
@include mat.all-component-densities(-2);
@include mat.button-density(0);
```

Formulieren: altijd `appearance="outline"`, nooit mixen.

Iconen: Material Symbols outlined. `18px` inline in tekst, `20px` in knoppen, `24px` standalone. Altijd `aria-label` of zichtbaar label.

Shape tokens:

```scss
--mat-sys-corner-medium: 12px;
--mat-sys-corner-full:   9999px;
```

## 7. Adversariële Check

Fonts:

- Is een custom font echt nodig?
- Zijn er maximaal 2 font-families geladen?
- Is het font gevalideerd op Typescale of Fontjoy?
- Worden alleen benodigde weights geladen?
- Heeft het font `display: swap`?

Spacing:

- Zitten alle waarden op het 4/8pt rooster?
- Is witruimte binnen groepen kleiner dan tussen groepen?

Hiërarchie:

- Zijn er maximaal 3 typografische niveaus zichtbaar?
- Werkt de hiërarchie ook zonder kleur?
- Is er genoeg contrast?

Angular Material:

- Worden `--mat-sys-*` tokens gebruikt?
- Is density passend?
- Worden overrides via `mat.*-overrides()` gedaan?

## 8. Outputformaat

```text
ELEMENT: [fonts / spacing / typografie / card / form / table / etc.]
CONTEXT: [welk scherm, welk framework, welke situatie]
PROBLEEM: [wat klopt er niet of wat is de vraag]
OPLOSSING: [concrete aanpassing met waarden of font-keuze]
PRINCIPE: [welke regel/reden]
CODE: [CSS/SCSS snippet — Angular Material variant indien relevant]
TOOL: [Fontjoy/Typescale/etc. als relevant]
ALTERNATIEF: [optionele tweede aanpak]
```

## 9. Bronnen

| Bron | Focus |
|------|-------|
| fontjoy.com | AI font-pairing tool, contrast-slider |
| fontpair.co | Gecureerde Google Fonts paren |
| typescale.com | Font-schaal en type-preview in context |
| typewolf.com | Fonts in echte websites, per industrie |
| material.angular.dev/guide/theming | Angular Material M3 theming API |
| m3.material.io/foundations/design-tokens | M3 design token systeem |
| nngroup.com — Visual Hierarchy | Proximity, spacing, hiërarchie |
| cieden.com — Spacing Best Practices | 8pt grid, intern kleiner dan extern |
