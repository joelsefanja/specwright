export type Locale = "nl" | "en";

export interface Translations {
  app: {
    product: string;
    introTitle: string;
    introSubtitle: string;
    introMode: string;
    introSystemStart: string;
    introStatusTitle: string;
    introStepProject: string;
    introStepMotion: string;
    introStepFlow: string;
    introNote: string;
    introFacts: string[];
    languageLabel: string;
    uiScaleLabel: string;
    uiScaleHelp: string;
    themeLabel: string;
    motionLabel: string;
    showSetup: string;
    hideSetup: string;
    showPanel: string;
    hidePanel: string;
    minimize: string;
    toggleFullscreen: string;
    close: string;
    themes: Record<string, string>;
    motions: Record<string, string>;
  };
  coach: {
    label: string;
    nextAction: string;
    back: string;
    forward: string;
    lockedStep: string;
    lockedStepHelp: (stepTitle: string) => string;
    goToStep: string;
    stepsAriaLabel: string;
    currentStep: string;
    completed: string;
    backUnavailable: string;
    forwardUnavailable: string;
  };
  activity: {
    title: string;
    subtitle: string;
    empty: string;
    statuses: Record<string, string>;
  };
  devFeedback: {
    menuAction: string;
    title: string;
    subtitle: string;
    contextTitle: string;
    selectedArea: string;
    visibleCopy: string;
    userRequest: string;
    agentProgress: string;
    opencodeOutput: string;
    noReadableText: string;
    improveQuestion: string;
    selectedText: string;
    technicalDetails: string;
    elementType: string;
    screenArea: string;
    placeholder: string;
    copyPrompt: string;
    sendToAgent: string;
    background: string;
    backgroundToggleLabel: string;
    running: string;
    starting: string;
    preparing: string;
    applying: string;
    finishing: string;
    backgroundNotice: string;
    jobsTitle: string;
    jobsCollapsedDone: string;
    jobRunning: string;
    jobDone: string;
    jobError: string;
    jobCancelled: string;
    cancel: string;
    cancelling: string;
    retry: string;
    takeOver: string;
    takingOver: string;
    takenOver: string;
    takeOverEmpty: string;
    close: string;
    copied: string;
    outputTitle: string;
    devOnly: string;
    element: string;
    after: string;
    screenshotUnavailable: string;
    elementContext: string;
    pageContext: string;
    continueSession: string;
    continuePlaceholder: string;
  };
  workflow: {
    summaries: {
      running: string;
      connectProject: string;
      describeTest: string;
      ready: string;
    };
    lockedReasons: Record<string, string>;
    steps: Record<string, { title: string; shortTitle: string; description: string; primaryAction: string }>;
  };
  connectProject: {
    step: string;
    title: string;
    description: string;
    openProject: string;
    preparingProject: string;
    changeProject: string;
    selectedFolder: string;
    recentProjects: string;
    recentDescription: string;
    noRecent: string;
    whatNext: string;
    nextDescription: string;
    nextButton: string;
    projectFolder: string;
    setupDetails: string;
  };
  configureAccess: {
    step: string;
    title: string;
    description: string;
    signInTitle: string;
    signInDescription: string;
    ready: string;
    needsDetails: string;
    useLogin: string;
    loginOn: string;
    loginOff: string;
    loginDetails: string;
    testWriter: string;
    testWriterDescription: string;
    opencode: string;
    anthropic: string;
    openai: string;
    ollama: string;
    model: string;
    modelPlaceholder: string;
    readyTitle: string;
    readyDescription: string;
    websiteTitle: string;
    websiteDescription: string;
    appLink: string;
    appLinkHelp: string;
    environment: string;
    authModal: {
      modalTitle: string;
      settings: string;
      close: string;
      intro: string;
      notFilledIn: string;
      requiredHelp: string;
      userIdentity: string;
      email: string;
      displayName: string;
      optional: string;
      displayNamePlaceholder: string;
      pictureUrl: string;
      picturePlaceholder: string;
      password: string;
      authMechanism: string;
      oneRequired: string;
      storageKey: string;
      storagePlaceholder: string;
      storageHelp: string;
      or: string;
      buttonTestId: string;
      signInPath: string;
      postLoginUrl: string;
      oauthRequired: string;
      passwordRequired: string;
      cancel: string;
      save: string;
    };
    nextButton: string;
  };
  describeTest: {
    step: string;
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
    addScenario: string;
    module: string;
    modulePlaceholder: string;
    testName: string;
    testNamePlaceholder: string;
    scenarioTypeTitle: string;
    scenarioTypeHelp: string;
    scenarioTypeHintTitle: string;
    scenarioTypeHint: string;
    exampleTitle: string;
    exampleItems: string[];
    appAreaHelp: string;
    moduleTypeTitle: string;
    moduleTypeDescription: string;
    workflowTypeTitle: string;
    workflowTypeDescription: string;
    startPage: string;
    startPagePlaceholderRelative: string;
    startPagePlaceholderFull: string;
    journeyNotes: string;
    journeyDescription: string;
    addNote: string;
    notePlaceholder: string;
    extraNotePlaceholder: string;
    removeNote: string;
    readiness: string;
    moduleNamed: string;
    contextProvided: string;
    startUrlAvailable: string;
    ready: string;
    needed: string;
    readinessDescription: string;
    addAppLink: string;
  };
  runTests: {
    label: string;
    title: string;
    description: string;
    currentScenario: string;
    currentScenarioHelp: string;
    untitledScenario: string;
    whatHappensTitle: string;
    whatHappensItems: string[];
    automaticProgressTitle: string;
    phaseLabels: Record<string, string>;
    phaseStatusLabels: Record<string, string>;
    oauthEmailRequired: string;
    running: string;
    start: string;
    adjustHint: string;
    adjustButton: string;
    relativeUrlError: (index: number) => string;
    invalidProtocolError: (index: number) => string;
    invalidUrlError: (index: number) => string;
  };
}

export const TRANSLATIONS: Record<Locale, Translations> = {
  nl: {
    app: {
      product: "Specwright Testmaker",
      introTitle: "Specwright wordt klaargezet",
      introSubtitle: "We laden je project, voorkeuren en teststappen.",
      introMode: "Werkruimte laden",
      introSystemStart: "Opstarten",
      introStatusTitle: "We regelen dit nu",
      introStepProject: "Projectmap controleren",
      introStepMotion: "Voorkeuren toepassen",
      introStepFlow: "Teststappen klaarzetten",
      introNote: "Bijna klaar. Je kunt zo verder.",
      introFacts: ["Tip: begin met één duidelijk scenario.", "Noem wat de gebruiker ziet als de actie lukt.", "Je kunt starten met tekst, een bestand of GitLab.", "Losse tests starten direct. Gekoppelde tests gebruiken eerdere stappen.", "Bij een fout bewaart Specwright de context voor herstel."],
      languageLabel: "Taal",
      uiScaleLabel: "Schaal",
      uiScaleHelp: "UI-schaal. Gebruik Ctrl/Cmd +, Ctrl/Cmd -, Ctrl/Cmd 0.",
      themeLabel: "Thema",
      motionLabel: "Animaties",
      showSetup: "Instellingen tonen",
      hideSetup: "Instellingen verbergen",
      showPanel: "Toon paneel",
      hidePanel: "Verberg paneel",
      minimize: "Minimaliseren",
      toggleFullscreen: "Volledig scherm wisselen",
      close: "Sluiten",
      themes: { slate: "Donker blauwgrijs", graphite: "Donker neutraal", paper: "Licht professioneel", sand: "Licht staal" },
      motions: { calm: "Rustig", operator: "Standaard", expressive: "Expressief" },
    },
    coach: { label: "Testhulp", nextAction: "Volgende stap", back: "Terug", forward: "Verder", lockedStep: "Nog niet klaar", lockedStepHelp: (stepTitle: string) => stepTitle ? `Rond eerst '${stepTitle}' af.` : "Rond eerst de huidige stap af.", goToStep: "Ga naar", stepsAriaLabel: "Teststappen", currentStep: "Nu", completed: "Klaar", backUnavailable: "Geen vorige stap", forwardUnavailable: "Geen volgende stap" },
    activity: { title: "Voortgang", empty: "Nog geen run gestart. Na de start zie je hier de stappen, bestanden en acties die aandacht nodig hebben.", statuses: { idle: "Wacht", running: "Bezig", done: "Klaar", error: "Niet gelukt", aborted: "Gestopt" } },
    devFeedback: { menuAction: "Ontwerp-feedback geven", title: "Ontwerp-feedback", subtitle: "Verbeter copy of UX in dit scherm", contextTitle: "Onderwerp van feedback", selectedArea: "Gekozen onderwerp", visibleCopy: "Tekst die nu zichtbaar is", userRequest: "Wat moet beter?", agentProgress: "Voortgang", opencodeOutput: "OpenCode-output", noReadableText: "Geen duidelijke tekst gevonden. Gebruik de schermafbeelding om het onderwerp te herkennen.", improveQuestion: "Beschrijf wat er voor de gebruiker beter moet: tekst, layout, status of interactie.", selectedText: "Tekst in beeld", technicalDetails: "Technische details", elementType: "Type", screenArea: "Plek in scherm", placeholder: "Bijvoorbeeld: Maak duidelijk waar deze status over gaat en noem het onderwerp expliciet.", copyPrompt: "Opdracht kopiëren", sendToAgent: "Feedback toepassen", background: "Op achtergrond", backgroundToggleLabel: "Feedback op achtergrond laten doorlopen", running: "Feedback wordt verwerkt...", starting: "Feedback wordt gestart", preparing: "Werkruimte klaargezet", applying: "Wijzigingen worden toegepast", finishing: "Resultaat wordt gecontroleerd", backgroundNotice: "De feedback loopt op de achtergrond door.", jobsTitle: "Ontwerp-feedback", jobsCollapsedDone: "feedback klaar", jobRunning: "bezig", jobDone: "klaar", jobError: "niet gelukt", jobCancelled: "geannuleerd", cancel: "Annuleren", cancelling: "Annuleren...", retry: "Opnieuw proberen", takeOver: "Gebruik deze verbetering", takingOver: "Verbetering overnemen...", takenOver: "Verbetering gebruikt", takeOverEmpty: "Er is niets aangepast.", close: "Sluiten", copied: "Opdracht gekopieerd", outputTitle: "Resultaat", devOnly: "Alleen beschikbaar tijdens lokaal ontwikkelen.", element: "Voor: gekozen onderwerp", after: "Na", screenshotUnavailable: "Geen voorbeeld beschikbaar", elementContext: "Alleen dit onderwerp", pageContext: "Hele pagina rond dit onderwerp", continueSession: "Vervolgvraag", continuePlaceholder: "Stuur een vervolgvraag. Enter verstuurt, Shift+Enter maakt een nieuwe regel." },
    workflow: {
      summaries: {
        running: "Specwright werkt aan je test. Je kunt de voortgang blijven volgen.",
        connectProject: "Kies eerst de projectmap van de app die je wilt testen.",
        describeTest: "De projectmap is gekozen. Beschrijf nu scenario's.",
        ready: "Alles staat klaar. Je kunt de test maken en starten.",
      },
      lockedReasons: {
        running: "Wacht tot de huidige stap klaar is.",
        "connect-project": "Deze stap is altijd beschikbaar.",
        "configure-access": "Kies eerst je projectmap.",
        "describe-test": "Vul eerst de URL van je app in.",
        "explore-app": "Beschrijf eerst wat je wilt testen en start daarna de test.",
        "review-plan": "Specwright moet eerst je app bekijken.",
        "generate-bdd": "Controleer eerst het voorstel.",
        "run-tests": "Laat Specwright eerst de test maken.",
        "heal-and-review": "Start de test eerst. Daarna kun je fouten verbeteren.",
      },
      steps: {
        "connect-project": { title: "Projectmap kiezen", shortTitle: "Projectmap kiezen", description: "Kies de map van je app. Daar zet Specwright de testbestanden neer.", primaryAction: "Projectmap kiezen" },
        "configure-access": { title: "URL van je app en login", shortTitle: "App-URL en login", description: "Vul de URL in waar Specwright de test moet starten. Voeg login toe als een scenario dat nodig heeft.", primaryAction: "App-URL invullen" },
        "describe-test": { title: "Scenario's beschrijven", shortTitle: "Scenario's beschrijven", description: "Beschrijf wat de gebruiker doet en wat zichtbaar moet kloppen.", primaryAction: "Scenario toevoegen" },
        "explore-app": { title: "App laten bekijken", shortTitle: "App bekijken", description: "Specwright zoekt de knoppen, velden en teksten die nodig zijn voor de test.", primaryAction: "Laat de app bekijken" },
        "review-plan": { title: "Voorstel controleren", shortTitle: "Voorstel checken", description: "Controleer of het voorstel klopt voordat de test wordt gemaakt.", primaryAction: "Controleer voorstel" },
        "generate-bdd": { title: "Test maken", shortTitle: "Test maken", description: "Specwright schrijft de automatische test voor je scenario.", primaryAction: "Maak de test" },
        "run-tests": { title: "Controleren en starten", shortTitle: "Controleren", description: "Controleer de scenario's en setup voordat Specwright de test maakt en draait.", primaryAction: "Test maken en draaien" },
        "heal-and-review": { title: "Resultaat verbeteren", shortTitle: "Resultaat verbeteren", description: "Los fouten op en bewaar alleen controles die werken.", primaryAction: "Bekijk resultaat" },
      },
    },
    connectProject: { step: "Stap 1", title: "Kies je projectmap", description: "Kies de projectmap waarin Specwright tests mag opslaan.", openProject: "Projectmap openen", preparingProject: "Projectmap wordt gecontroleerd...", changeProject: "Andere map kiezen", selectedFolder: "Gekozen map", recentProjects: "Eerder geopend", recentDescription: "Open snel een projectmap die je eerder gebruikte.", noRecent: "Nog geen projectmap gekozen. Open een projectmap om te starten.", whatNext: "Daarna", nextDescription: "Projectmap staat klaar. Voeg nu de app-link toe.", nextButton: "App-link toevoegen", projectFolder: "Projectmap", setupDetails: "Technische details tonen" },
    configureAccess: { step: "Stap 2", title: "App-toegang instellen", description: "Vul alleen in wat Specwright nodig heeft om je app te openen en eventueel in te loggen.", signInTitle: "Login", signInDescription: "Zet dit alleen aan als de test een ingelogde gebruiker nodig heeft.", ready: "Klaar", needsDetails: "Nog nodig", useLogin: "Login gebruiken", loginOn: "Specwright logt in met je testgebruiker.", loginOff: "Geen login nodig. Specwright opent de app direct.", loginDetails: "Testlogin instellen", testWriter: "Test-AI kiezen", testWriterDescription: "Kies waarmee Specwright je app bekijkt en de test schrijft. Laat OpenCode staan als je lokaal werkt.", opencode: "OpenCode lokaal (aanbevolen)", anthropic: "Anthropic Claude", openai: "OpenAI-compatible", ollama: "Ollama lokaal", model: "Modelnaam", modelPlaceholder: "bijv. claude-sonnet-4-6 of gpt-4o", readyTitle: "Toegang klaar", readyDescription: "Beschrijf nu scenario's.", websiteTitle: "URL van je app", websiteDescription: "Plak de URL van de omgeving die je wilt testen.", appLink: "URL van je app", appLinkHelp: "Gebruik de volledige URL, bijvoorbeeld je test-, acceptatie- of productieomgeving.", environment: "Omgeving", nextButton: "Scenario's beschrijven", authModal: { modalTitle: "Testlogin instellen", settings: "instellen", close: "Sluiten", intro: "Specwright gebruikt deze testgebruiker alleen voor scenario's waarvoor login nodig is.", notFilledIn: "Nog niet ingevuld", requiredHelp: "Gebruik een testaccount met toegang tot de omgeving die je wilt testen.", userIdentity: "Testgebruiker", email: "E-mailadres", displayName: "Naam in de app", optional: "optioneel", displayNamePlaceholder: "Bij leeg gebruikt Specwright het e-mailadres", pictureUrl: "Profielfoto-link", picturePlaceholder: "Bij leeg maakt Specwright initialen", password: "Wachtwoord", authMechanism: "Loginmethode", oneRequired: "minimaal één", storageKey: "Opslagsleutel", storagePlaceholder: "bijv. app-auth-user", storageHelp: "Gebruik dit als je app login opslaat in de browser.", or: "of", buttonTestId: "Login-knop test-ID", signInPath: "Loginpagina", postLoginUrl: "Pagina na login", oauthRequired: "Vul een e-mailadres in en kies hoe Specwright de login herkent.", passwordRequired: "Vul e-mailadres en wachtwoord in.", cancel: "Annuleren", save: "Login opslaan" } },
    describeTest: { step: "Stap 3", title: "Scenario's beschrijven", description: "Schrijf in gewone taal wat de gebruiker wil doen, waar die begint en welk resultaat zichtbaar moet zijn.", emptyTitle: "Begin met één duidelijk scenario", emptyDescription: "Eén goed beschreven scenario is genoeg. Specwright zet die om naar een testplan en later naar BDD-stappen.", addScenario: "Scenario toevoegen", module: "Plek in de app", modulePlaceholder: "bijv. Afrekenen", testName: "Naam voor deze test", testNamePlaceholder: "bijv. gast-afrekenen", scenarioTypeTitle: "Kan deze test los draaien?", scenarioTypeHelp: "Los is voor één doel dat direct kan starten. Gekoppeld is voor een reeks waarin een eerdere actie nodig is.", scenarioTypeHintTitle: "Hoe kies je dit?", scenarioTypeHint: "Twijfel je? Kies losse test. Kies gekoppelde test alleen als de test eerst iets moet maken, opslaan, terugvinden of hergebruiken voordat de controle klopt.", exampleTitle: "Goed scenario", exampleItems: ["Gebruiker opent Afrekenen vanaf /checkout", "Gebruiker vult verzendgegevens in en kiest betalen", "Gebruiker ziet de totaalprijs en een duidelijke bevestiging"], appAreaHelp: "Vul de herkenbare app-sectie in waar deze test over gaat. Specwright gebruikt dit als mapnaam om de test terug te vinden.", moduleTypeTitle: "Losse test", moduleTypeDescription: "Voor één pagina of onderdeel dat direct kan starten. Voorbeeld: gebruiker opent Afrekenen en ziet de juiste prijs.", workflowTypeTitle: "Gekoppelde test", workflowTypeDescription: "Voor stappen die afhankelijk zijn van eerder gemaakte data. Voorbeeld: gebruiker maakt een poll, vindt die terug en controleert de weergave.", startPage: "Waar start de gebruiker?", startPagePlaceholderRelative: "/dashboard of volledige link", startPagePlaceholderFull: "Plak de volledige link", journeyNotes: "Wat doet de gebruiker en wat moet kloppen?", journeyDescription: "Beschrijf de actie en het zichtbare resultaat. Specwright gebruikt dit als basis voor het BDD-testplan.", addNote: "Actie toevoegen", notePlaceholder: "Voorbeeld: gebruiker maakt een poll en ziet die op het scherm.", extraNotePlaceholder: "Extra actie of controle", removeNote: "Actie verwijderen", readiness: "Benodigd voor je test", moduleNamed: "Plek in de app", contextProvided: "Actie en resultaat", startUrlAvailable: "Startpunt", ready: "Ingevuld", needed: "Nog nodig", readinessDescription: "Vul aan wat nog nodig is. Daarna kan Specwright je app bekijken en de test maken.", addAppLink: "App-link toevoegen" },
    runTests: { label: "Stap 4", title: "Controleren en starten", description: "Controleer wat Specwright gaat doen en start pas wanneer project, app-URL en scenario's kloppen.", currentScenario: "Scenario dat je zojuist beschreef", currentScenarioHelp: "Deze lijst komt uit stap 3: scenario's, startpagina en controles die je hebt ingevuld.", untitledScenario: "Scenario zonder naam", whatHappensTitle: "Wat Specwright straks doet", whatHappensItems: ["Run voorbereiden", "Scenario's lezen", "App bekijken", "Selectors controleren", "Test schrijven", "Test draaien", "Fouten herstellen", "Resultaat opslaan"], automaticProgressTitle: "Voortgang", phaseLabels: { "Initialization": "Voorbereiden", "Detection & Routing": "Bron kiezen", "Input Processing": "Scenario's lezen", "Exploration & Planning": "App bekijken en plannen", "Seed Validation": "Selectors controleren", "Exploration Validation": "Selectors controleren", "User Approval": "Plan goedkeuren", "BDD Generation": "Test schrijven", "Test Creation": "Test schrijven", "Test Execution & Healing": "Draaien en fouten herstellen", "Cleanup": "Opruimen", "Final Review": "Resultaat beoordelen" }, phaseStatusLabels: { pending: "Wacht", running: "Bezig", done: "Klaar", error: "Niet gelukt", skipped: "Overgeslagen" }, oauthEmailRequired: "Vul eerst het OAuth e-mailadres in.", running: "Test loopt...", start: "Test maken en draaien", adjustHint: "Wil je iets wijzigen?", adjustButton: "Scenario aanpassen", relativeUrlError: (index) => `Test ${index}: vul eerst de app-URL in voor dit startpunt.`, invalidProtocolError: (index) => `Test ${index}: gebruik een link die begint met http of https.`, invalidUrlError: (index) => `Test ${index}: vul een geldige startlink in.` },
  },
  en: {
    app: { product: "Specwright Test Maker", introTitle: "Preparing your test workspace", introSubtitle: "We are preparing your workspace: project, language, theme, and test flow.", introMode: "Preparing workspace", introSystemStart: "System start", introStatusTitle: "Checklist", introStepProject: "Find project and sources", introStepMotion: "Restore theme and language", introStepFlow: "Prepare test flow", introNote: "Almost there. Next you can continue straight into your test.", introFacts: ["Good to know: one sharp scenario often creates better tests than five loose ideas.", "Specwright can start from text, a file, or GitLab.", "Standalone tests start directly; linked tests build on something that must exist first.", "Tip: always name what the user sees when the action succeeds.", "When tests fail, Specwright keeps context so recovery is faster."], languageLabel: "Language", uiScaleLabel: "Scale", uiScaleHelp: "UI scale. Use Ctrl/Cmd +, Ctrl/Cmd -, Ctrl/Cmd 0.", themeLabel: "Theme", motionLabel: "Animations", showSetup: "Show settings", hideSetup: "Hide settings", showPanel: "Show panel", hidePanel: "Hide panel", minimize: "Minimize", toggleFullscreen: "Toggle full screen", close: "Close", themes: { slate: "Dark blue gray", graphite: "Dark neutral", paper: "Light professional", sand: "Light steel" }, motions: { calm: "Calm", operator: "Standard", expressive: "Expressive" } },
    coach: { label: "Test helper", nextAction: "Next step", back: "Back", forward: "Next", lockedStep: "Not ready yet", lockedStepHelp: (stepTitle: string) => stepTitle ? `Complete '${stepTitle}' first.` : "Complete the current step first.", goToStep: "Go to", stepsAriaLabel: "Test steps", currentStep: "Now", completed: "Done", backUnavailable: "No previous step", forwardUnavailable: "No next step" },
    activity: { title: "Progress", empty: "No run started yet. After start, this shows steps, files, and actions that need attention.", statuses: { idle: "Waiting", running: "Running", done: "Done", error: "Failed", aborted: "Stopped" } },
    devFeedback: { menuAction: "Give design feedback", title: "Design feedback", subtitle: "Improve copy or UX in this screen", contextTitle: "Feedback subject", selectedArea: "Selected subject", visibleCopy: "Current visible copy", userRequest: "What should improve?", agentProgress: "Progress", opencodeOutput: "OpenCode output", noReadableText: "No clear text found. Use the screenshot to identify the subject.", improveQuestion: "Describe what should improve for the user: copy, layout, status, or interaction.", selectedText: "Visible text", technicalDetails: "Technical details", elementType: "Type", screenArea: "Screen area", placeholder: "For example: Make clear what this status refers to and name the subject explicitly.", copyPrompt: "Copy request", sendToAgent: "Apply feedback", background: "In background", backgroundToggleLabel: "Keep feedback running in the background", running: "Feedback is being processed...", starting: "Starting feedback", preparing: "Workspace prepared", applying: "Applying changes", finishing: "Checking result", backgroundNotice: "The feedback keeps running in the background.", jobsTitle: "Design feedback", jobsCollapsedDone: "feedback done", jobRunning: "running", jobDone: "done", jobError: "failed", jobCancelled: "cancelled", cancel: "Cancel", cancelling: "Cancelling...", retry: "Try again", takeOver: "Use this improvement", takingOver: "Using improvement...", takenOver: "Improvement used", takeOverEmpty: "Nothing changed.", close: "Close", copied: "Request copied", outputTitle: "Result", devOnly: "Only available during local development.", element: "Before: selected subject", after: "After", screenshotUnavailable: "No preview available", elementContext: "Only this subject", pageContext: "Full page around this subject", continueSession: "Follow-up", continuePlaceholder: "Send a follow-up. Enter sends, Shift+Enter adds a new line." },
    workflow: {
      summaries: { running: "Specwright is working on your test. You can follow the progress here.", connectProject: "First choose the project folder for the app you want to test.", describeTest: "The project folder is ready. Now describe what the user should be able to do.", ready: "Everything is ready. You can create and start the test." },
      lockedReasons: { running: "Wait until the current step is done.", "connect-project": "This step is always available.", "configure-access": "Choose your project folder first.", "describe-test": "Add your app URL first.", "explore-app": "Describe what you want to test, then start the test.", "review-plan": "Specwright needs to inspect your app first.", "generate-bdd": "Check the proposal first.", "run-tests": "Let Specwright create the test first.", "heal-and-review": "Start the test first. Then you can improve failures." },
      steps: {
        "connect-project": { title: "Choose project folder", shortTitle: "Choose project folder", description: "Choose your app's folder. Specwright saves the test files there.", primaryAction: "Choose project folder" },
        "configure-access": { title: "App URL and login", shortTitle: "App URL and login", description: "Add the URL where Specwright should start the test. Add login only when a scenario needs it.", primaryAction: "Add app URL" },
        "describe-test": { title: "Describe scenarios", shortTitle: "Describe scenarios", description: "Describe what the user does and what should be visible when it works.", primaryAction: "Add scenario" },
        "explore-app": { title: "Inspect the app", shortTitle: "Inspect app", description: "Specwright finds the buttons, fields, and text needed for the test.", primaryAction: "Inspect the app" },
        "review-plan": { title: "Check proposal", shortTitle: "Check proposal", description: "Check the proposal before the test is created.", primaryAction: "Check proposal" },
        "generate-bdd": { title: "Create test", shortTitle: "Create test", description: "Specwright writes the automated test for your scenario.", primaryAction: "Create the test" },
        "run-tests": { title: "Review and start", shortTitle: "Review", description: "Review the scenarios and setup before Specwright creates and runs the test.", primaryAction: "Create and run test" },
        "heal-and-review": { title: "Improve result", shortTitle: "Improve result", description: "Fix failures and keep only checks that work.", primaryAction: "Review result" },
      },
    },
    connectProject: { step: "Step 1", title: "Choose your project folder", description: "Choose the project folder where Specwright may save tests.", openProject: "Open project folder", preparingProject: "Checking project folder...", changeProject: "Choose another folder", selectedFolder: "Selected", recentProjects: "Recent projects", recentDescription: "Quickly open a project folder you used before.", noRecent: "No project folder chosen yet. Open a project folder to start.", whatNext: "Next", nextDescription: "Project folder is ready. Add the app link next.", nextButton: "Add app link", projectFolder: "Project folder", setupDetails: "Show technical details" },
    configureAccess: { step: "Step 2", title: "Set app access", description: "Add only what Specwright needs to open your app and sign in if needed.", signInTitle: "Login", signInDescription: "Turn this on only when the test needs a signed-in user.", ready: "Ready", needsDetails: "Still needed", useLogin: "Use login", loginOn: "Specwright signs in with your test user.", loginOff: "No login needed. Specwright opens the app directly.", loginDetails: "Set test login", testWriter: "Choose test AI", testWriterDescription: "Choose what Specwright uses to inspect your app and write the test. Keep OpenCode if you work locally.", opencode: "OpenCode local (recommended)", anthropic: "Anthropic Claude", openai: "OpenAI-compatible", ollama: "Ollama local", model: "Model name", modelPlaceholder: "e.g. claude-sonnet-4-6 or gpt-4o", readyTitle: "Access ready", readyDescription: "Now describe what the user should be able to do.", websiteTitle: "App URL", websiteDescription: "Paste the URL for the environment you want to test.", appLink: "App URL", appLinkHelp: "Use the full URL, for example your test, staging, or production environment.", environment: "Environment", nextButton: "Describe scenarios", authModal: { modalTitle: "Set test login", settings: "settings", close: "Close", intro: "Specwright uses this test user only for scenarios that need login.", notFilledIn: "Not filled in yet", requiredHelp: "Use a test account with access to the environment you want to test.", userIdentity: "Test user", email: "Email address", displayName: "Name in the app", optional: "optional", displayNamePlaceholder: "If empty, Specwright uses the email address", pictureUrl: "Profile photo link", picturePlaceholder: "If empty, Specwright creates initials", password: "Password", authMechanism: "Login method", oneRequired: "at least one", storageKey: "Storage key", storagePlaceholder: "e.g. app-auth-user", storageHelp: "Use this when your app stores login in the browser.", or: "or", buttonTestId: "Login button test ID", signInPath: "Login page", postLoginUrl: "Page after login", oauthRequired: "Add an email address and choose how Specwright recognizes the login.", passwordRequired: "Add an email address and password.", cancel: "Cancel", save: "Save login" } },
    describeTest: { step: "Step 3", title: "Describe scenarios", description: "Write what the user does, where they start, and what they should see when it works.", emptyTitle: "Start with one scenario", emptyDescription: "One scenario is enough to start. Specwright turns it into a test plan and then BDD steps.", addScenario: "Add scenario", module: "App location", modulePlaceholder: "e.g. Checkout", testName: "Name for this test", testNamePlaceholder: "e.g. guest-checkout", scenarioTypeTitle: "Can this test run by itself?", scenarioTypeHelp: "Standalone is for one goal that can start directly. Linked is for a sequence where an earlier action is required.", scenarioTypeHintTitle: "How to choose", scenarioTypeHint: "When in doubt, choose standalone. Choose linked only when the test must create, save, find, or reuse something before the check makes sense.", exampleTitle: "Good scenario", exampleItems: ["User opens Checkout from /checkout", "User fills in shipping details and chooses payment", "User sees the total price and a clear confirmation"], appAreaHelp: "Enter the recognizable app section this test is about. Specwright uses it as the folder name so you can find the test later.", moduleTypeTitle: "Standalone test", moduleTypeDescription: "For one page or app area that can start directly. Example: user opens Checkout and sees the right price.", workflowTypeTitle: "Linked test", workflowTypeDescription: "For steps that depend on data created earlier. Example: user creates a poll, finds it again, and checks the display.", startPage: "Where does the user start?", startPagePlaceholderRelative: "/dashboard or full link", startPagePlaceholderFull: "Paste the full link", journeyNotes: "What does the user do and what should be true?", journeyDescription: "Describe the action and visible result. Specwright uses this as the basis for the BDD test plan.", addNote: "Add action", notePlaceholder: "Example: user creates a poll and sees it on screen.", extraNotePlaceholder: "Extra action or check", removeNote: "Remove action", readiness: "Needed for your test", moduleNamed: "App location", contextProvided: "Customer action and result", startUrlAvailable: "Starting point", ready: "Filled", needed: "Still needed", readinessDescription: "Fill in what is still missing. Then Specwright can inspect your app and create the test." },
    runTests: { label: "Step 4", title: "Review and start", description: "Review what Specwright will do and start only when project, app URL, and scenarios are correct.", currentScenario: "Scenario you just described", currentScenarioHelp: "This list comes from step 3: scenarios, start page, and checks you entered.", untitledScenario: "Untitled scenario", whatHappensTitle: "What Specwright will do", whatHappensItems: ["Prepare the run", "Read scenarios", "Inspect the app", "Check selectors", "Write the test", "Run the test", "Fix failures", "Save results"], automaticProgressTitle: "Progress", phaseLabels: { "Initialization": "Preparing", "Detection & Routing": "Choosing source", "Input Processing": "Reading scenario", "Exploration & Planning": "Inspecting and planning", "Seed Validation": "Checking selectors", "Exploration Validation": "Checking selectors", "User Approval": "Approve plan", "BDD Generation": "Writing the test", "Test Creation": "Writing the test", "Test Execution & Healing": "Running and fixing failures", "Cleanup": "Cleaning up", "Final Review": "Reviewing result" }, phaseStatusLabels: { pending: "Waiting", running: "Running", done: "Done", error: "Failed", skipped: "Skipped" }, oauthEmailRequired: "Add the OAuth email address first.", running: "Test running...", start: "Create and run test", adjustHint: "Need to change something?", adjustButton: "Adjust scenario", relativeUrlError: (index) => `Test ${index}: add the app URL before using this starting point.`, invalidProtocolError: (index) => `Test ${index}: use a link that starts with http or https.`, invalidUrlError: (index) => `Test ${index}: enter a valid start link.` },
  },
};
