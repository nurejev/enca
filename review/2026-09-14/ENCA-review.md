> Historical review of commit 8ec00e8, before beta build 25357. Implementation and validation are recorded in BETA-25357.md. Source line links below refer to the reviewed snapshot.

# ENCA — code-, product- en layoutreview

**Datum:** 14 september 2026
**Beoordeelde versie:** `v1.0.250-beta.356`, build `25356`
**Commit:** `8ec00e815f4548e0b1aec4d8772fc17cf899b21a`
**Repository:** `/Users/mihaimonte/REPO/enca`

## Oordeel

ENCA heeft een sterke inhoudelijke basis: persona’s, beleidsafhankelijkheden, impactanalyse, documentatie en beheer komen samen op één plek. Vooral de koppeling tussen een bevinding, de betrokken personen/groepen en het beleid maakt het product waardevol. De architectuur als statische browserapp is begrijpelijk en eenvoudig zelf te hosten.

De grootste problemen zitten in **de betrouwbaarheid van enkele conclusies en importpaden**, gevolgd door **de visuele hiërarchie**. Niet alle analyses onderscheiden “niet gelezen” van “niet aanwezig”, en de import kan een actieve vervanging zonder een bedoelde uitsluiting publiceren. De interface vergroot dit probleem wanneer zij een verkeerde status meldt of belangrijke context verbergt.

Mijn advies: eerst de onderstaande P1-bevindingen herstellen, daarna de gedeelde CSS corrigeren en een compacte beleidswerkruimte invoeren. Een compleet nieuw frontendframework is hiervoor niet nodig.

## Onderzoek en grenzen

Dit is een brede repository- en UX-review met verdieping in de kritieke paden, geen uitputtende pentest of certificering van elke Graph-integratie. Onderzocht: structuur, authenticatie en Graph-verkeer, import en groepswijzigingen, scope- en What-If-evaluatie, gapanalyse, export, gedeelde vormgeving, documentatie en self-hostingconfiguratie.

De lokale demo is bekeken op desktop en op 390 pixels breed. Startpagina, Policies en Checks zijn geopend; de demo-checks zijn uitgevoerd. De repository bevat 67 app-JavaScriptbestanden, 33 toolschermen en 19 zichtbare hoofdtools in deze beta. `app.js` telt 20.177 regels. De broncode is niet aangepast; de reviewbestanden zijn toegevoegd onder deze map.

**Uitgevoerd:**

- Alle 67 app-JavaScriptbestanden laten parsen: geslaagd.
- Bestaande toolbarcontrole: geslaagd, 33 schermen en 32 toolbars.
- Bestaande controle op opmaak in tekstvelden: geslaagd.
- Negen gerichte gedragsreproducties met lokale fixtures en gesimuleerde Graph-antwoorden: onderstaande fouten/inconsistenties bevestigd.
- Microsoft Graph- en nginx-documentatie geraadpleegd voor de betrokken gegevensvormen en configuratieregels.

Er is niet ingelogd op een echte tenant en er zijn geen tenantwijzigingen uitgevoerd. De nginx-bevinding is vastgesteld uit configuratie plus officiële documentatie; er is geen container gestart. Exportfouten zijn via code-inspectie vastgesteld; er is geen volledige Word/PDF-exportmatrix getest. De drie mockups zijn ontwerpvoorstellen met demogegevens, geen wijzigingen aan ENCA.

## Bevindingen met prioriteit

P1 = herstellen vóór deze functie als betrouwbare basis voor productiehandelingen wordt gebruikt. P2 = concrete tekortkoming voor de volgende kwaliteitsronde. P3 = onderhoud/afwerking.

### 1. P1 — Actieve vervanging gaat door zonder een nieuwe uitsluitingsgroep

**Bron:** [import.js:708](/Users/mihaimonte/REPO/enca/js/import.js:708), [import.js:739](/Users/mihaimonte/REPO/enca/js/import.js:739), [app.js:3546](/Users/mihaimonte/REPO/enca/js/app.js:3546).

Bij “Match & replace” erft het nieuwe beleid de bestaande toestand. Ontbreekt de mapping voor een nieuwe uitsluitingsgroep, dan wordt die groep overgeslagen en verschijnt alleen een waarschuwing. Het nieuwe beleid kan dus **On** worden aangemaakt zonder de beoogde uitsluiting; vervolgens wordt het oude beleid uitgezet.

**Reproductie:** bestaand beleid `enabled`; nieuw beleid voegt `{{group:BreakGlass}}` toe; mapping ontbreekt. Resultaat: nieuwe POST met `state: enabled`, lege `excludeGroups`, oude PATCH naar `disabled`, resultaat `ok: true`.

**Gevolg:** gebruikers die de nieuwe baseline bewust wil uitzonderen, kunnen onmiddellijk onder de aangescherpte regels vallen. Dat kan ook de noodtoegang raken. Dit vereist een mislukte of ontbrekende dependency; het treedt niet bij iedere import op.

**Herstel:** maak onopgeloste scope-afhankelijkheden blokkerend voor de betrokken policy. Laat een actieve vervanging pas toe nadat de volledige payload, uitsluitingen en teruggelezen toestand overeenkomen met het goedgekeurde plan. Behoud het oude beleid wanneer het nieuwe niet compleet kan worden geplaatst. Beoordeel ook het verwante pad dat na een 400 onbekende appreferenties verwijdert: [import.js:850](/Users/mihaimonte/REPO/enca/js/import.js:850).

### 2. P1 — Import meldt “Off” terwijl de nieuwe policy actief kan zijn

**Bron:** [app.js:3559](/Users/mihaimonte/REPO/enca/js/app.js:3559), [app.js:3584](/Users/mihaimonte/REPO/enca/js/app.js:3584), [import.js:708](/Users/mihaimonte/REPO/enca/js/import.js:708).

De voortgangsregel en de afsluitende melding schrijven letterlijk “Off”, ook wanneer `importPolicies` de nieuwe toestand als `enabled` teruggeeft. De toestandsovername bij vervangen is op zichzelf bedoeld gedrag; de terugmelding weerspreekt dat gedrag.

**Gevolg:** een beheerder kan denken dat een wijziging nog niet handhaaft terwijl ze al actief is. Dit is ook bij een volledig geslaagde import mogelijk, los van bevinding 1.

**Herstel:** render `r.state` per policy en geef in de samenvatting aantallen On / Report-only / Off. Gebruik diezelfde resultaatstructuur voor voortgang, toast en rapport. Verifieer de werkelijk opgeslagen toestand voordat de UI succes meldt.

### 3. P1 — What-If leest slechts een deel van samengestelde apparaatfilters

**Bron:** [whatifeval.js:67](/Users/mihaimonte/REPO/enca/js/whatifeval.js:67).

De evaluator zoekt herkenbare fragmenten met reguliere expressies en keert direct terug. De rest van een samengestelde regel telt daardoor niet mee.

**Reproductie:** een blokbeleid sluit apparaten uit met `device.isCompliant -eq True -and device.trustType -eq "ServerAD"`. Voor een compliant apparaat dat niet hybrid joined is, meldt ENCA dat het blokbeleid niet van toepassing is. Alleen de eerste clausule is bekeken.

**Gevolg:** een beheerder kan een verkeerde verwachting krijgen over blokkeren of toestaan. Microsoft staat meerdere expressies binnen één filter toe. [Microsoft: device filters](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-condition-filters-for-devices).

**Herstel:** parse de volledige ondersteunde grammatica, of accepteer uitsluitend exact herkende eenvoudige regels en geef voor alle overige regels “niet bepaald”. Modelleer compliance en join-type als aparte eigenschappen: een apparaat kan beide zijn. Een waarschuwing mag geen zekere toegangsuitkomst worden.

### 4. P1 — Insider-riskvoorwaarde wordt overgeslagen door verkeerde type-aanname

**Bron:** [whatifeval.js:173](/Users/mihaimonte/REPO/enca/js/whatifeval.js:173), [demo.js:55](/Users/mihaimonte/REPO/enca/js/demo.js:55).

`nonEmpty` accepteert alleen arrays. `insiderRiskLevels` is in het Graph-schema echter een enumwaarde die als string wordt weergegeven. De eigen demo gebruikt ook die vorm. [Microsoft: conditionalAccessConditionSet](https://learn.microsoft.com/en-us/graph/api/resources/conditionalaccessconditionset?view=graph-rest-beta).

**Reproductie:** beleid uitsluitend voor `elevated`, scenario `minor`; ENCA laat het blokbeleid toch toepassen, zonder waarschuwing.

**Herstel:** normaliseer elke Graph-eigenschap volgens haar eigen schema. Voeg fixtures toe voor geldige waarden, ontbrekende invoer en onbekende enumwaarden. Controleer de overige nieuwere voorwaarden op dezelfde array/string-aanname.

### 5. P1 — Onleesbare uitsluitingsgroepen worden lege groepen

**Bron:** [analyze.js:194](/Users/mihaimonte/REPO/enca/js/analyze.js:194), [analyze.js:203](/Users/mihaimonte/REPO/enca/js/analyze.js:203), [analyze.js:246](/Users/mihaimonte/REPO/enca/js/analyze.js:246).

Bij een fout bij het uitlezen van groepsleden slaat `collect` een lege set op. Rollezingen hebben vergelijkbare lege foutpaden. Er wordt geen volledigheidsstatus meegenomen naar de uiteindelijke conclusie.

**Reproductie:** All Users met een uitgesloten groep; de ledenopvraag van die groep geeft 403. ENCA meldt voor de testgebruiker `mfaCovered: true` en `riskyCount: 0`, hoewel niet bekend is of die gebruiker is uitgesloten.

**Herstel:** bewaar per dependency `complete`, `partial` of `failed`, inclusief oorzaak. Laat beïnvloede gebruikers/conclusies “onbekend” worden. Neem ontbrekende lezingen en pagineringslimieten ook mee in exports. De expliciete “Not read”-aanpak die elders al bestaat is een bruikbaar patroon, maar moet door de evaluatie heen lopen.

### 6. P1 — Een optionele MFA-grant telt als MFA-dekking

**Bron:** [analyze.js:283](/Users/mihaimonte/REPO/enca/js/analyze.js:283), [analyze.js:293](/Users/mihaimonte/REPO/enca/js/analyze.js:293).

`mfaVia` telt een policy mee zodra haar controlset MFA bevat. De grantoperator wordt bij die conclusie niet betrokken.

**Reproductie:** de enige policy vereist `mfa OR compliantDevice`. ENCA rapporteert `mfaCovered: true`, terwijl het compliant-devicepad MFA niet verplicht. De operator bepaalt volgens Graph de relatie tussen de grants. [Microsoft: grant controls](https://learn.microsoft.com/en-us/graph/api/resources/conditionalaccessgrantcontrols?view=graph-rest-1.0).

**Herstel:** onderscheid “MFA als mogelijkheid” en “MFA vereist”. Houd ook de scope en voorwaarden bij de conclusie zichtbaar; een control in één beperkte policy bewijst geen universele bescherming. Classificeer authentication strengths op de toegestane combinaties in plaats van alleen op aanwezigheid.

### 7. P2 — Guestscope verliest gebruikerstype en partner-tenant

**Bron:** [cascope.js:71](/Users/mihaimonte/REPO/enca/js/cascope.js:71), [whatifeval.js:107](/Users/mihaimonte/REPO/enca/js/whatifeval.js:107), [analyze.js:80](/Users/mihaimonte/REPO/enca/js/analyze.js:80).

De scopevoorbereiding maakt van het volledige guest/external-object een boolean. De geselecteerde externe gebruikerstypen en tenants verdwijnen. Het subjectmodel is bovendien hoofdzakelijk “guest ja/nee”. Graph onderscheidt onder meer collaboration guests, collaboration members en service providers, plus optionele tenantselecties. [Microsoft: guest and external scope](https://learn.microsoft.com/en-us/graph/api/resources/conditionalaccessguestsorexternalusers?view=graph-rest-1.0).

**Reproductie:** een service-providerselectie voor partner A wordt ook als toepasselijk beoordeeld op een collaboration guest van partner B. Daarnaast interpreteert `CaScope` de legacytoken `GuestsOrExternalUsers` wel, maar de gebruikerscontrole in What-If niet.

**Herstel:** één gedeeld scopecontract met de nodige identiteitseigenschappen, ondersteunde external-types en partner-tenantinformatie. Geef een onbekende scope wanneer die gegevens ontbreken. Laat What-If en gapanalyse dat contract daadwerkelijk gebruiken; alleen een gedeeld bestand toevoegen voorkomt de bestaande parallelle logica niet.

### 8. P2 — Batch-retries zijn onbegrensd en verliezen de API-versie

**Bron:** [graph.js:349](/Users/mihaimonte/REPO/enca/js/graph.js:349), [app.js:6357](/Users/mihaimonte/REPO/enca/js/app.js:6357).

De batchfunctie roept zichzelf opnieuw aan zonder retryteller, opties of voortgangscallback. De algemene limiet van vijf retries geldt daardoor niet voor opeenvolgende fouten op individuele batchonderdelen. Een expliciet gekozen `v1.0`-endpoint valt bij de eerste retry terug naar de standaard `beta`.

**Reproductie:** zeven gesimuleerde 429-antwoorden gevolgd door succes leveren acht requests op; request 1 gaat naar v1.0, requests 2–8 naar beta. Bij blijvende 429’s stopt dit pad niet zelfstandig.

**Herstel:** expliciete pogingsteller, behoud van `opts` en een annuleerbaar wachtpad. Neem per item een definitieve mislukking op zodra het budget is verstreken. Dat batchonderdelen apart kunnen worden beperkt, is gedocumenteerd door Microsoft. [Microsoft: JSON batching](https://learn.microsoft.com/en-us/graph/json-batching).

### 9. P2 — Starttegel-CSS beschadigt volledige toolschermen

**Bron:** [index.html:330](/Users/mihaimonte/REPO/enca/index.html:330), [app.css:971](/Users/mihaimonte/REPO/enca/css/app.css:971), [app.css:1251](/Users/mihaimonte/REPO/enca/css/app.css:1251).

Zowel een starttegel als een hele pagina draagt `.tool`. Daardoor gelden de tegelachtergrond, padding, hovertransformatie en alle `.tool h3`-regels ook voor de pagina en haar interne koppen. De ruimte voor het versiebadge — `padding-right: 104px` — belandt dus ook in beleidskoppen.

**Browserbewijs:** een beleidskop van ongeveer 220 pixels breed kreeg 104 pixels rechterpadding. De beleidsnaam brak op desktop in veel korte regels. Op 390 pixels ontstonden een sterk versmalde titel en zichtbare horizontale overflow; de eerste beleidskaart begon pas onder een vrijwel volledig scherm met navigatie en acties.

**Herstel:** scheid `.tool-tile` en `.tool-screen`, of scope tegelregels onder `#screen-home`. Gebruik directe-kindselectors voor de tegelkop. Corrigeer dit vóór een grotere restyling: een klein aantal selectors veroorzaakt een groot deel van het huidige ruimteverlies.

### 10. P2 — Belangrijke bediening is niet semantisch toegankelijk

**Bron:** [index.html:161](/Users/mihaimonte/REPO/enca/index.html:161), [index.html:2476](/Users/mihaimonte/REPO/enca/index.html:2476), [index.html:2648](/Users/mihaimonte/REPO/enca/index.html:2648), [app.js:1565](/Users/mihaimonte/REPO/enca/js/app.js:1565).

Starttegels zijn klikbare `div`-elementen en verschijnen in de toegankelijkheidsboom als containers, niet als links of knoppen. De sidebar heeft wel echte knoppen, maar verdwijnt op smalle schermen. Veel modals hebben geen dialoogrol; het “What's new”-venster wordt geopend zonder focusverplaatsing of een afgeschermde achtergrond. Eén groepenvenster heeft al wel expliciete dialoogsemantiek: dat patroon is nog niet algemeen.

**Herstel:** echte links/knoppen voor navigatie, benoemde selectievakjes, een gedeelde dialoog met focusherstel en toetsenbordafhandeling, en duidelijke actieve states. Controleer de primaire taken met uitsluitend toetsenbord. Dit was een gerichte semantische inspectie, geen volledige WCAG-audit.

### 11. P2 — nginx verliest securityheaders op het HTML-document

**Bron:** [nginx.conf:26](/Users/mihaimonte/REPO/enca/selfhost/nginx.conf:26).

De server zet onder meer `X-Frame-Options` en `Referrer-Policy`. De `/index.html`-location bevat eigen `add_header`-regels. Bij het gebruikte nginx-inheritancemodel worden de headers van het bovenliggende niveau daardoor niet overgenomen. Alleen de lokaal herhaalde headers blijven over. Hetzelfde patroon staat bij het brandingbestand. [nginx: add_header inheritance](https://nginx.org/en/docs/http/ngx_http_headers_module.html).

**Gevolg:** juist het applicatiedocument mist de bedoelde framebescherming en overige niet herhaalde headers. De CSP-metatag compenseert geen ontbrekende `frame-ancestors`-header.

**Herstel:** hergebruik een header-include in iedere location met eigen headers, of herschik de cachingconfiguratie. Verifieer `/` en `/index.html` in de gebouwde image. Gebruik geen nieuwere nginx-inheritancesyntax zonder ook de daadwerkelijke imageversie te ondersteunen.

### 12. P2 — Documentatie-export kan beleidskaarten stil overslaan

**Bron:** [export.js:259](/Users/mihaimonte/REPO/enca/js/export.js:259), [export.js:492](/Users/mihaimonte/REPO/enca/js/export.js:492).

PNG-bundles en Word-export vangen renderfouten per kaart op, loggen ze naar de console en bouwen het bestand verder. Het downloadresultaat heeft geen verplicht overzicht van ontbrekende kaarten. Een gebruiker kan zo een gedeeltelijk document als volledig doorgeven.

**Herstel:** verzamel fouten expliciet en toon `verwacht / opgenomen / ontbrekend`. Laat complete export standaard stoppen bij ontbrekende verplichte inhoud, of lever een herkenbaar gedeeltelijk bestand met manifest en zichtbare foutpagina. Test één mislukte kaart tussen geslaagde kaarten. Deze bevinding is op broncode vastgesteld, niet met een gerenderde export gereproduceerd.

### 13. P2 — De bestaande kwaliteitscontroles beschermen de kernlogica niet

**Bron:** [docker.yml](/Users/mihaimonte/REPO/enca/.github/workflows/docker.yml), [check-toolbar-order.js](/Users/mihaimonte/REPO/enca/tools/check-toolbar-order.js), [check-plain-text.js](/Users/mihaimonte/REPO/enca/tools/check-plain-text.js).

De meegeleverde controles slagen, terwijl de fouten hierboven reproduceerbaar zijn. De aangetroffen GitHub-workflow publiceert de container maar voert deze controles of gedragstests niet uit. De twee scripts bewaken vormconventies, geen toegangsevaluatie of importgaranties.

**Herstel:** voeg een kleine, verplichte suite toe voor scope, grants, import, gedeeltelijke reads en batch-retries. Laat zowel de huidige vormcontroles als de gedragstests vóór publicatie draaien. Gebruik daarnaast een beperkte browser-smoketest voor het gedeelde schermskelet. Een groot testframework is niet nodig om de pure functies te beschermen.

### 14. P3 — Demo-ID’s en productdocumentatie lopen achter

**Bron:** [demo.js:60](/Users/mihaimonte/REPO/enca/js/demo.js:60), [demo.js:107](/Users/mihaimonte/REPO/enca/js/demo.js:107), [README.md](/Users/mihaimonte/REPO/enca/README.md), [SECURITY.md](/Users/mihaimonte/REPO/enca/SECURITY.md).

De demo bevat twaalf policies maar slechts elf unieke ID’s: `d7` komt tweemaal voor. Omdat selectie en detailopzoeking ID’s gebruiken, kan dit onbedoeld meerdere kaarten koppelen en controles maskeren.

De README beschrijft onder meer import als altijd Off en creatie als standaard role-assignable, terwijl de huidige code uitzonderingen respectievelijk een andere standaard heeft. SECURITY beschrijft Graph-only tokengebruik, terwijl de app ook expliciet ARM-tokens en ARM-verkeer ondersteunt. De in-app “About”-tekst noemt het geheel nog read-only.

**Herstel:** unieke fixture-ID’s als invariant, validatie van fixturevormen, en documentatie herschrijven vanuit de huidige feature- en permissieregistratie. Vermijd absolute securitybeloften die niet alle actieve functies dekken.

## Wat behouden moet blijven

- Het persona- en baselineconcept: dat onderscheidt ENCA van een algemene tabel met policies.
- Directe Graph-communicatie, gedelegeerde authenticatie met PKCE en expliciete scopes per handeling.
- De expliciete scheiding tussen On, Report-only en Off in het domeinmodel.
- Bronlinks, change reports, dependency-informatie en inzicht in uitsluitingen.
- De bestaande `RunLedger`, toolregistratie en gedeelde verdictcomponent als uitgangspunt voor consistentie.
- De demo, zelfhosting en lokaal gegenereerde bestanden: laagdrempelig uit te proberen en eenvoudig te delen.

## Layoutadvies

### Navigatie: minder gewicht, dezelfde functionaliteit

De recente consolidatie naar 19 hoofdtools is een goede stap. Toch staan nu een lange sidebar, geopende tooltabs, tabs binnen tools en een grote startcatalogus naast elkaar. Op een kleiner scherm worden labels afgekapt en domineert navigatie de werkruimte.

Gebruik één vaste primaire navigatie met ongeveer zes tot acht bestemmingen: Overview, Policies, Groups & people, Dependencies, Checks, What-If, Sign-in logs en Changes. Geef Baseline/Deploy een duidelijke eigen ingang waar dat past. Plaats details als modes of acties bij hun onderwerp. Houd geopende werktabs alleen als gebruikers daar aantoonbaar baat bij hebben; geef ze minder visueel gewicht dan de actuele pagina.

Laat **tenantnaam en omgeving permanent zichtbaar** zijn, ook wanneer het accountmenu dicht is. De accountinitialen alleen zijn te weinig context voor iemand die veel tenants beheert. Toon het verschil tussen demo, productie en zelfhosting compact naast die naam.

### Policies: lijst als startpunt, detail naast de selectie

Maak de lijst de standaardweergave voor beheer. Een rij bevat een leesbare titel, CA-nummer, persona en toestand. De volledige technische beleidsnaam blijft kopieerbaar in het detailpaneel; verander daarmee de echte policynaam niet. Gebruik cards voor documentatie of een korte verzameling, de matrix voor vergelijking.

Op desktop opent selectie een detailpaneel van ongeveer 300–380 pixels bij een ruime viewport. In een smallere werkruimte stapelt het paneel onder de lijst. Wisselen tussen Overview, Scope, Dependencies en JSON behoudt de selectie en filters.

Bundel exports onder één herkenbare ingang. Toon groepswijziging, statuswijziging en verwijderen als contextacties bij een echte selectie. Schrijf bij iedere bulkactie precies hoeveel policies en welke scope worden geraakt.

### Checks: conclusie, oorzaak en bewijs bij elkaar

Laat de resultaten direct na een korte paginakop beginnen. Zet bevindingen op prioriteit en plaats beleid, betrokken scope, bron, volledigheid en volgende stap bij de geselecteerde bevinding. Houd de inhoudelijke verschillen tussen rulepacks beschikbaar; een gedeelde lijst hoeft niet alle matrices en details tot hetzelfde formaat terug te brengen.

Toon standaard “niet gelezen” of “gedeeltelijk” wanneer bewijs ontbreekt. Een kaart met nul fouten krijgt pas een positieve betekenis als de relevante gegevens compleet zijn. Laat percentages en scores de concrete bevindingen ondersteunen; voorkom dat ze die vervangen.

### Minder uitleg boven de taak

De starttegels bevatten vaak volledige functiebeschrijvingen. Op desktop nemen twee tijdelijke tools vrijwel de eerste viewport in beslag. Dat vertraagt dagelijks gebruik.

Gebruik op een tegel een titel, één zin en hooguit één relevante status. Plaats handleidingen achter “Hoe werkt dit?”. Geef tijdelijke tools een compacte deadlinevermelding en extra nadruk wanneer een uitgevoerde scan werkelijk actie vraagt. Geen prominente “alles is goed”-claim als nog niet is gescand.

Maak “What's new” een korte, niet blokkerende samenvatting met een link. Tijdens de inspectie werd een venster met 601 wijzigingen sinds een eerdere bezochte build getoond; dat is een changelog, geen geschikte onderbreking van het werk.

### Vormtaal

Behoud donkergroen als identiteit en gebruik geel spaarzaam voor focus of een belangrijke accentactie. Reserveer rood voor problemen/destructieve acties en amber voor aandacht. Een uitgeschakelde policy hoort meestal neutraal te zijn: Off kan bewust gekozen zijn. Koppel elke kleur aan tekst.

Gebruik één rustige achtergrond, subtiele scheidingen, 6–10 pixels afronding en minder schaduw. Houd werkruimte, kaart, subkaart en tekstblok visueel uit elkaar zonder ieder niveau opnieuw in een groot vlak te zetten. Vervang de uiteenlopende emoji’s door één iconenset met labels. Verplaats technische toolnummers en versies naar help/detail of ondersteunende metadata.

Richt op 13–14 pixels voor tabelinhoud, 12 pixels voor secundaire tekst, 24–28 pixels voor paginatitels en consistente tussenruimtes. Ondersteun een compacte en comfortabele tabeldichtheid. Laat de inhoud de rijhoogte bepalen bij langere tekst.

### Smalle schermen

Op 390 pixels moeten paginakop, zoekveld en hoofdfilter snel plaatsmaken voor resultaten. Vouw secundaire filters achter één knop. Gebruik één contextactiemenu voor acties die nu een horizontale knoppenrij nodig hebben. Laat de pagina zelf niet horizontaal scrollen; een brede matrix mag een eigen scrollgebied hebben. Open details over de volledige beschikbare breedte.

## De drie mockups

De mockups staan bij deze review in het gesprek. Ze gebruiken Engelse interfacewoorden, in lijn met ENCA, en uitsluitend demogegevens. Leesbare titels zijn presentatievoorstellen; de oorspronkelijke policynamen blijven zichtbaar. De geleide uitrol is een nieuw voorgesteld werkproces en bestaat niet als deze geïntegreerde flow in de beoordeelde app.

| Richting                                   | Wat verandert                                              | Beste toepassing                                     | Afweging                                                    |
| ------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| **1. Policy workspace — aanbevolen basis** | Compacte sidebar, lijst als hoofdweergave, inspectiepaneel | Dagelijks beheer en consultants                      | Vereist vaste regels voor selectie, filterbehoud en panelen |
| **2. Review desk**                         | Brede bevindingenlijst naast concrete evidence             | Audits, troubleshooting en uitleg aan collega’s      | Minder geschikt als startpunt voor veel bulkbeheer          |
| **3. Guided rollout**                      | Scope → plan → impact → go-live                            | Baseline-implementatie en gecontroleerde wijzigingen | Extra stappen kunnen routinematig beheer vertragen          |

Mijn keuze is **1 als algemene interface**, **2 binnen Checks** en **3 als optioneel pad onder Deploy**. De drie ideeën vullen elkaar aan zonder dat ieder scherm een wizard of dashboard hoeft te worden.

## Aanpak in drie stappen

1. **Betrouwbaarheid:** blokkeer incompleet importeren, corrigeer statusmeldingen en evaluatie, en voer onbekende/partiële resultaten door. Voeg de genoemde fixtures toe als echte regressietests met de juiste verwachtingen.
2. **Gedeeld schermskelet:** los de CSS-classbotsing op; maak tenantcontext, paginakop, toolbar, tabel en detailpaneel consistent. Begin met Policies en pas het skelet daarna toe op vergelijkbare schermen.
3. **Werkprocessen:** verbeter Checks met evidence naast de bevinding en voeg daarna de optionele uitrolflow toe. Verplaats lange toelichtingen naar contextuele hulp en werk de security-/productdocumentatie bij.

## Reproduceerbaar bewijs

De lokale [reproducties](/Users/mihaimonte/REPO/enca/review/2026-09-14/reproduce.cjs) laden de bestaande pure functies in geïsoleerde contexten. Graph-antwoorden zijn fixtures; er worden geen echte tokens gebruikt en geen netwerkrequests verstuurd. De [vastgelegde uitkomsten](/Users/mihaimonte/REPO/enca/review/2026-09-14/evidence.json) bevatten negen gedragsprobes plus het parseresultaat voor de 67 appbestanden.

De assertions bevestigen bewust het **huidige foutgedrag**. Een geslaagde uitvoering is bewijs dat de bevindingen reproduceerbaar zijn, geen bewijs dat ENCA correct werkt. Maak hiervan bij herstel regressietests die het gewenste gedrag eisen.
