/* =========================================================
   KÇ Prishtina 038 — bilingual strings & language switcher
   ========================================================= */

const I18N = {
  sq: {
    // Nav
    "nav.about": "Klubi",
    "nav.sections": "Seksionet",
    "nav.events": "Garat",
    "nav.join": "Bashkohu",
    "nav.news": "Lajme",
    "nav.contact": "Kontakti",

    // Brand block
    "brand.kc": "KÇ Prishtina 038",
    "brand.sub": "Klubi Çiklistik · Prishtinë",

    // Hero (landing)
    "hero.eyebrow": "Themeluar 2022 · Anëtar i FÇK & UCI",
    "hero.title.1": "Mbi qiellin",
    "hero.title.2": "e ",
    "hero.title.em": "Prishtinës",
    "hero.title.3": ", vetëm",
    "hero.title.4": "ne pedalojmë.",
    "hero.lede": "Klubi çiklistik i Prishtinës. Gjashtë disiplina, një ekip, një qytet. Garojmë nën kodin e UCI dhe FÇK — nga shtigjet e Germisë te kalendari kontinental.",
    "hero.cta.primary": "Bëhu pjesë e klubit",
    "hero.cta.ghost": "Shfletoni seksionet",
    "hero.meta.founded": "Themeluar",
    "hero.meta.founded.val": "2022 · Prishtinë",
    "hero.meta.under": "Nën rregullat",
    "hero.meta.under.val": "UCI · ECU · FÇK",
    "hero.meta.sections": "Disiplina",
    "hero.meta.sections.val": "6 seksione",
    "hero.meta.riders": "Çiklistë aktivë",
    "hero.meta.riders.val": "47",
    "hero.photo.label": "FOTO · EKIPI NË STËRVITJE — GERMI",
    "hero.photo.corner": "JPG · 16:9",

    // Stats
    "stats.km.num": "184 200",
    "stats.km.label": "KM të pedaluar — sezoni 2025",
    "stats.podium.num": "23",
    "stats.podium.label": "Pozita në podium — kombëtare",
    "stats.juniors.num": "18",
    "stats.juniors.label": "Çiklistë në akademinë e të rinjve",
    "stats.years.num": "04",
    "stats.years.label": "Vite në kalendar",

    // Countdown
    "cd.status": "Gara e ardhshme",
    "cd.title": "Granfondo Sharri 2026",
    "cd.subtitle": "Brezovicë → Prevallë → Prizren · 142 km · 2 600 m ngritje",
    "cd.days": "Ditë",
    "cd.hours": "Orë",
    "cd.minutes": "Min",
    "cd.seconds": "Sek",
    "cd.cta": "Regjistrohu për garën",
    "cd.detail": "Kategoritë: Elite · U23 · Masters · Femra · Youth",

    // About teaser
    "about.eyebrow": "Klubi",
    "about.title": "Tre themelues. Një ide e qartë: ta vendosim Prishtinën në hartën çiklistike të Ballkanit.",
    "about.body": "KÇ Prishtina 038 lindi në vitin 2022 nga Qëndrim Pllana, Albion Ymeri dhe Shqiponja Osmani Pllana. I regjistruar nën Federatën Çiklistike të Kosovës dhe duke garuar sipas rregullave të UCI dhe ECU, klubi mban gjashtë disiplina aktive — nga rruga te treku, nga shtigjet e maleve te akademia e re e të rinjve.",
    "about.founder.1.name": "Qëndrim Pllana",
    "about.founder.1.role": "Themelues · President",
    "about.founder.2.name": "Albion Ymeri",
    "about.founder.2.role": "Themelues · Trajner kryesor",
    "about.founder.3.name": "Shqiponja Osmani Pllana",
    "about.founder.3.role": "Themelueze · Programe të femrave",
    "about.link": "Lexo historinë e plotë",

    // Disciplines section
    "disc.eyebrow": "Seksionet",
    "disc.title": "Gjashtë disiplina. Një ekip.",
    "disc.lede": "Çdo disiplinë ka trajnerin e vet, kalendarin e vet, dhe palestrën e vet. Por kemi një logo dhe një gjuhë.",
    "disc.road.name": "Rrugë",
    "disc.road.desc": "Sezoni i pranverës–vjeshtës. Garat kombëtare të FÇK, Granfondo, dhe etapat rajonale.",
    "disc.road.meta": "12 çiklistë · trajner: A. Ymeri",
    "disc.mtb.name": "MTB",
    "disc.mtb.desc": "Cross-country mbi Germinë, Sharrin dhe Prokletijet. Format XCO dhe maratonë.",
    "disc.mtb.meta": "9 çiklistë · trajner: B. Krasniqi",
    "disc.gravel.name": "Gravel",
    "disc.gravel.desc": "E reja e klubit. Gara aventureske dhe ekspedita të hapura në rrugët dytësore të Kosovës.",
    "disc.gravel.meta": "8 çiklistë · trajner: Q. Pllana",
    "disc.track.name": "Trek",
    "disc.track.desc": "Disiplinë e shkurtër — sprint, keirin, persecution. Bashkëpunim me velodromin rajonal.",
    "disc.track.meta": "5 çiklistë · trajner: D. Berisha",
    "disc.youth.name": "Akademia e të rinjve",
    "disc.youth.desc": "Çiklistët e ardhshëm të Kosovës — moshat 9–17 vjeç. Stërvitje çdo të shtunë.",
    "disc.youth.meta": "18 fëmijë · trajnere: Sh. Osmani Pllana",
    "disc.women.name": "Femra",
    "disc.women.desc": "Programi i çiklizmit të femrave — gara, ride të hapura, dhe mentorim ndër-gjenerata.",
    "disc.women.meta": "11 çikliste · trajnere: Sh. Osmani Pllana",
    "disc.go": "Hape seksionin",

    // Results
    "results.eyebrow": "Rezultatet e fundit",
    "results.title": "Sezoni 2025 në numra.",
    "results.lede": "Garat ku kemi marrë pjesë në gjashtë muajt e fundit. Lista e plotë në Garat.",
    "results.col.race": "Gara",
    "results.col.date": "Data",
    "results.col.rider": "Çiklisti",
    "results.col.category": "Kategoria",
    "results.col.pos": "Pozita",
    "results.cta": "Të gjitha rezultatet",
    "results.r1.race": "Tour of Kosovo — etapa 2",
    "results.r1.rider": "Albion Ymeri",
    "results.r1.cat": "Elite · Rrugë",
    "results.r2.race": "Sharri MTB Marathon",
    "results.r2.rider": "Blerton Krasniqi",
    "results.r2.cat": "Masters · MTB",
    "results.r3.race": "Granfondo Prizren",
    "results.r3.rider": "Era Hoxha",
    "results.r3.cat": "Elite Femra · Rrugë",
    "results.r4.race": "Kampionati Kombëtar — Krono",
    "results.r4.rider": "Qëndrim Pllana",
    "results.r4.cat": "Masters · Krono",
    "results.r5.race": "Balkan Junior Cup — Tiranë",
    "results.r5.rider": "Edon Gashi",
    "results.r5.cat": "Junior · Rrugë",

    // Roster
    "roster.eyebrow": "Ekipi",
    "roster.title": "Çiklistët tanë.",
    "roster.lede": "Një faqe nga libri i ekipit 2026. Roster i plotë me biografi në faqen e ekipit.",
    "roster.cta": "Shih të gjithë ekipin",

    // Events / Calendar
    "events.eyebrow": "Kalendari",
    "events.title": "Garat e ardhshme.",
    "events.lede": "Çfarë po vijon — për ekipin, për anëtarët, dhe për çdo çiklist që dëshiron të vrapojë me ne.",
    "events.tag.race": "Garë",
    "events.tag.ride": "Ride i hapur",
    "events.tag.camp": "Kamp stërvitor",
    "events.cta": "Kalendari i plotë",

    // News
    "news.eyebrow": "Lajme",
    "news.title": "Nga klubi.",
    "news.cta": "Të gjitha lajmet",

    // Gallery
    "gallery.eyebrow": "Galeria",
    "gallery.title": "Një vit në fotografi.",
    "gallery.lede": "Stërvitjet, garat, çastet jashtë biçikletës. Kontribuoni fotot tuaja në kanalin Drive të anëtarëve.",

    // Sponsors
    "sponsors.eyebrow": "Sponsorët",
    "sponsors.title": "Bëjnë rolimin të mundur.",
    "sponsors.bp.name": "BikePlus",
    "sponsors.bp.role": "Sponsor teknik · Mekanika & komponentët",
    "sponsors.bp.body": "Servisi i biçikletave dhe komponentët për gjithë ekipin që nga 2022.",
    "sponsors.nv.name": "Novus",
    "sponsors.nv.role": "Sponsor i përgjithshëm",
    "sponsors.nv.body": "Përkrahja kryesore për sezonin garues — fanellat, udhëtimet, kampet.",

    // Join CTA
    "join.eyebrow": "Bashkohu",
    "join.title": "Nëse pedalon, ka vend për ty.",
    "join.lede": "Pranojmë çiklistë të të gjitha niveleve nga 9 vjeç e lart. Stërvitje me trajner, kalendar me gara, fanellë e klubit dhe një ekip që të shtyn.",
    "join.cta": "Apliko si anëtar",
    "join.perk.1": "Stërvitje me trajner çertifikuar — 3× në javë",
    "join.perk.2": "Kalendari i garave FÇK & rajonale",
    "join.perk.3": "Fanella e klubit + helmetë gjatë sezonit",
    "join.perk.4": "Servis i biçikletës me BikePlus",
    "join.perk.5": "Akses te kampet stërvitore verore",
    "join.perk.6": "Komunitet me çiklistë nga gjithë Kosova",

    // Shop
    "shop.eyebrow": "Dyqani",
    "shop.title": "Vesh ngjyrat e klubit.",
    "shop.lede": "Fanella e sezonit 2026 është në prodhim. Para-porositë janë të hapura për anëtarët dhe simpatizantët.",
    "shop.p1.name": "Fanella e sezonit",
    "shop.p1.tag": "Pre-order",
    "shop.p2.name": "Bib pantallona",
    "shop.p2.tag": "Pre-order",
    "shop.p3.name": "Casquette e klubit",
    "shop.p3.tag": "Në stok",

    // Support
    "support.eyebrow": "Mbështet klubin",
    "support.title": "Pa sponsorët dhe donatorët, pa garë.",
    "support.lede": "Klubi është organizatë jofitimprurëse. Buxheti shkon në fanella, udhëtime, kampe dhe akademinë e të rinjve.",
    "support.donate.title": "Bëj një donacion",
    "support.donate.body": "Kontribute njëhershe ose mujore. Çdo euro shkon në programin e të rinjve.",
    "support.donate.cta": "Dono tani",
    "support.sponsor.title": "Bëhu sponsor",
    "support.sponsor.body": "Logoja juaj në fanellë, në karavanin e garave dhe në kanalet tona dixhitale.",
    "support.sponsor.cta": "Shih paketat",

    // Contact / Footer
    "contact.eyebrow": "Kontakti",
    "contact.title": "Na gjeni në Prishtinë.",
    "contact.address": "Rruga e Maleve 14, 10000 Prishtinë",
    "contact.email": "info@prishtina038.cc",
    "contact.phone": "+383 38 000 000",
    "contact.hours": "Stërvitje: E martë & e enjte 18:00 · E shtunë 09:00",
    "foot.about": "Klubi",
    "foot.disciplines": "Disiplinat",
    "foot.community": "Komuniteti",
    "foot.legal": "Anëtarësia · Politika e privatësisë · UCI",
    "foot.tagline": "Nga rruga te shtegu. Nga Prishtina për Kosovën.",
    "foot.copy": "© 2026 KÇ Prishtina 038 · Të gjitha të drejtat e rezervuara",
    "foot.federation": "I regjistruar pranë FÇK · ID: KS-22-038",

    // Section detail (MTB)
    "sec.mtb.eyebrow": "Seksioni 02 · MTB",
    "sec.mtb.title": "Cross-country mbi Germinë.",
    "sec.mtb.lede": "Disiplina më e madhe e klubit pas Rrugës. Stërvitemi në shtigjet e Germisë, Sharrit dhe Prokletijeve, garojmë në kalendarin XCO të FÇK dhe në maratonat rajonale.",
    "sec.mtb.spec.coach": "Trajner kryesor",
    "sec.mtb.spec.coach.v": "Blerton Krasniqi",
    "sec.mtb.spec.size": "Madhësia",
    "sec.mtb.spec.size.v": "9 çiklistë · 3 juniorë",
    "sec.mtb.spec.training": "Stërvitja",
    "sec.mtb.spec.training.v": "E martë 18:00 · E shtunë 09:00 · Germi",
    "sec.mtb.spec.formats": "Formatet",
    "sec.mtb.spec.formats.v": "XCO · Marathon · Enduro (eksperimental)",
    "sec.mtb.spec.season": "Sezoni",
    "sec.mtb.spec.season.v": "Prill — Tetor",
    "sec.mtb.spec.fee": "Anëtarësia / muaj",
    "sec.mtb.spec.fee.v": "25 € (e zbritur për anëtarët U23)",
    "sec.mtb.cta": "Apliko për MTB",
    "sec.mtb.h.calendar": "Kalendari i sezonit",
    "sec.mtb.h.team": "Çiklistët e seksionit",
    "sec.mtb.h.coach": "Trajneri",
    "sec.mtb.coach.body": "Blerton ka 12 vite në çiklizmin e maleve, dy herë kampion kombëtar (2019, 2022) dhe trajner UCI Level 2. Stërvitjet i ndan në tri blloqe sezonale: bazë (Prill–Maj), intensitet (Qershor–Korrik), garë (Gusht–Tetor).",

    // Sections hub
    "secs.eyebrow": "Seksionet",
    "secs.title": "Gjashtë disiplina, një klub.",
    "secs.lede": "Zgjidhni një seksion për të parë trajnerin, oraret e stërvitjes, kalendarin e garave dhe çiklistët aktualë.",

    // Events page
    "evpage.eyebrow": "Kalendari 2026",
    "evpage.title": "Çdo garë dhe ride e sezonit 2026.",
    "evpage.lede": "Filtroni sipas disiplinës, kategorisë ose muajit. Anëtarët gjejnë regjistrimin në panel personal.",
    "evpage.filter.all": "Të gjitha",
    "evpage.filter.race": "Garat",
    "evpage.filter.ride": "Ride të hapura",
    "evpage.filter.camp": "Kampet",

    // Join page
    "jp.eyebrow": "Anëtarësia",
    "jp.title": "Apliko si anëtar i klubit.",
    "jp.lede": "Plotëso formularin më poshtë. Pas aplikimit, trajneri i seksionit do të të kontaktojë brenda 5 ditëve pune.",
    "jp.form.name": "Emri dhe mbiemri",
    "jp.form.age": "Mosha",
    "jp.form.email": "Email",
    "jp.form.phone": "Telefon",
    "jp.form.section": "Seksioni i preferuar",
    "jp.form.exp": "Përvojë çiklistike",
    "jp.form.notes": "Shënime shtesë",
    "jp.form.submit": "Dërgo aplikimin",
    "jp.exp.beg": "Fillestar — më pak se 1 vit",
    "jp.exp.int": "I avancuar — 1–3 vite",
    "jp.exp.adv": "Garues aktiv — 3+ vite",
    "jp.fee.title": "Anëtarësia",
    "jp.fee.body": "20–35 € në muaj, varësisht nga seksioni dhe mosha. Akademia e të rinjve është gratis për çiklistët nën 14 vjeç.",
    "jp.proc.title": "Si funksionon",
    "jp.proc.1": "Plotëson aplikimin online",
    "jp.proc.2": "Trajneri i seksionit të kontakton për një stërvitje provë",
    "jp.proc.3": "Të caktohet kategoria dhe oraret",
    "jp.proc.4": "Merr fanellën dhe e fillon sezonin"
  },

  en: {
    "nav.about": "Club",
    "nav.sections": "Sections",
    "nav.events": "Calendar",
    "nav.join": "Join",
    "nav.news": "News",
    "nav.contact": "Contact",

    "brand.kc": "KÇ Prishtina 038",
    "brand.sub": "Cycling Club · Prishtina",

    "hero.eyebrow": "Founded 2022 · Member of FÇK & UCI",
    "hero.title.1": "Above the sky",
    "hero.title.2": "of ",
    "hero.title.em": "Prishtina",
    "hero.title.3": ", only",
    "hero.title.4": "we ride.",
    "hero.lede": "Prishtina's cycling club. Six disciplines, one team, one city. We race under UCI and FÇK regulation — from the trails of Germia to the continental calendar.",
    "hero.cta.primary": "Join the club",
    "hero.cta.ghost": "Browse sections",
    "hero.meta.founded": "Founded",
    "hero.meta.founded.val": "2022 · Prishtina",
    "hero.meta.under": "Under regulation",
    "hero.meta.under.val": "UCI · ECU · FÇK",
    "hero.meta.sections": "Disciplines",
    "hero.meta.sections.val": "6 sections",
    "hero.meta.riders": "Active riders",
    "hero.meta.riders.val": "47",
    "hero.photo.label": "PHOTO · TEAM TRAINING — GERMIA",
    "hero.photo.corner": "JPG · 16:9",

    "stats.km.num": "184 200",
    "stats.km.label": "Kilometers ridden — 2025 season",
    "stats.podium.num": "23",
    "stats.podium.label": "National podium finishes",
    "stats.juniors.num": "18",
    "stats.juniors.label": "Riders in the youth academy",
    "stats.years.num": "04",
    "stats.years.label": "Years on the calendar",

    "cd.status": "Next race",
    "cd.title": "Granfondo Sharri 2026",
    "cd.subtitle": "Brezovica → Prevallë → Prizren · 142 km · 2 600 m climbing",
    "cd.days": "Days",
    "cd.hours": "Hours",
    "cd.minutes": "Min",
    "cd.seconds": "Sec",
    "cd.cta": "Register for the race",
    "cd.detail": "Categories: Elite · U23 · Masters · Women · Youth",

    "about.eyebrow": "The club",
    "about.title": "Three founders. One clear idea: put Prishtina on the Balkan cycling map.",
    "about.body": "KÇ Prishtina 038 was founded in 2022 by Qëndrim Pllana, Albion Ymeri and Shqiponja Osmani Pllana. Registered with the Cycling Federation of Kosovo and racing under UCI and ECU regulation, the club runs six active disciplines — from road to track, from mountain trails to a brand-new youth academy.",
    "about.founder.1.name": "Qëndrim Pllana",
    "about.founder.1.role": "Founder · President",
    "about.founder.2.name": "Albion Ymeri",
    "about.founder.2.role": "Founder · Head coach",
    "about.founder.3.name": "Shqiponja Osmani Pllana",
    "about.founder.3.role": "Founder · Women's program",
    "about.link": "Read the full story",

    "disc.eyebrow": "Sections",
    "disc.title": "Six disciplines. One team.",
    "disc.lede": "Each discipline has its own coach, its own calendar, its own gym. But one logo and one language.",
    "disc.road.name": "Road",
    "disc.road.desc": "Spring–autumn season. FÇK national races, Granfondos, and regional stage races.",
    "disc.road.meta": "12 riders · coach: A. Ymeri",
    "disc.mtb.name": "MTB",
    "disc.mtb.desc": "Cross-country across Germia, Sharri and the Accursed Mountains. XCO and marathon formats.",
    "disc.mtb.meta": "9 riders · coach: B. Krasniqi",
    "disc.gravel.name": "Gravel",
    "disc.gravel.desc": "The newest section. Adventure events and open expeditions across Kosovo's back roads.",
    "disc.gravel.meta": "8 riders · coach: Q. Pllana",
    "disc.track.name": "Track",
    "disc.track.desc": "The short discipline — sprint, keirin, pursuit. Partnered with the regional velodrome.",
    "disc.track.meta": "5 riders · coach: D. Berisha",
    "disc.youth.name": "Youth Academy",
    "disc.youth.desc": "The future of Kosovar cycling — ages 9–17. Training every Saturday morning.",
    "disc.youth.meta": "18 kids · coach: Sh. Osmani Pllana",
    "disc.women.name": "Women's",
    "disc.women.desc": "The women's cycling program — racing, open rides and inter-generational mentoring.",
    "disc.women.meta": "11 riders · coach: Sh. Osmani Pllana",
    "disc.go": "Open the section",

    "results.eyebrow": "Latest results",
    "results.title": "The 2025 season in numbers.",
    "results.lede": "Races we entered in the last six months. The full list is on the Calendar page.",
    "results.col.race": "Race",
    "results.col.date": "Date",
    "results.col.rider": "Rider",
    "results.col.category": "Category",
    "results.col.pos": "Pos.",
    "results.cta": "All results",
    "results.r1.race": "Tour of Kosovo — Stage 2",
    "results.r1.rider": "Albion Ymeri",
    "results.r1.cat": "Elite · Road",
    "results.r2.race": "Sharri MTB Marathon",
    "results.r2.rider": "Blerton Krasniqi",
    "results.r2.cat": "Masters · MTB",
    "results.r3.race": "Granfondo Prizren",
    "results.r3.rider": "Era Hoxha",
    "results.r3.cat": "Elite Women · Road",
    "results.r4.race": "National Championship — TT",
    "results.r4.rider": "Qëndrim Pllana",
    "results.r4.cat": "Masters · TT",
    "results.r5.race": "Balkan Junior Cup — Tirana",
    "results.r5.rider": "Edon Gashi",
    "results.r5.cat": "Junior · Road",

    "roster.eyebrow": "The team",
    "roster.title": "Our riders.",
    "roster.lede": "A page from the 2026 team book. Full roster with bios on the team page.",
    "roster.cta": "See the full team",

    "events.eyebrow": "Calendar",
    "events.title": "Upcoming races.",
    "events.lede": "What's next — for the team, for members, and for any rider who wants to roll with us.",
    "events.tag.race": "Race",
    "events.tag.ride": "Open ride",
    "events.tag.camp": "Training camp",
    "events.cta": "Full calendar",

    "news.eyebrow": "News",
    "news.title": "From the club.",
    "news.cta": "All news",

    "gallery.eyebrow": "Gallery",
    "gallery.title": "A year in photographs.",
    "gallery.lede": "Training, races, moments off the bike. Contribute your shots through the members Drive channel.",

    "sponsors.eyebrow": "Sponsors",
    "sponsors.title": "They make the rolling possible.",
    "sponsors.bp.name": "BikePlus",
    "sponsors.bp.role": "Technical sponsor · Mechanics & components",
    "sponsors.bp.body": "Servicing and components for the whole team since 2022.",
    "sponsors.nv.name": "Novus",
    "sponsors.nv.role": "Title sponsor",
    "sponsors.nv.body": "Lead backer of the racing season — kits, travel, and camps.",

    "join.eyebrow": "Join",
    "join.title": "If you pedal, there's a place for you.",
    "join.lede": "We take riders of all levels from age 9 up. Coached training, race calendar, club kit, and a team that pushes you.",
    "join.cta": "Apply as a member",
    "join.perk.1": "Coached training with certified coaches — 3× a week",
    "join.perk.2": "Full FÇK and regional race calendar",
    "join.perk.3": "Club kit + helmet for the season",
    "join.perk.4": "Bike servicing with BikePlus",
    "join.perk.5": "Access to summer training camps",
    "join.perk.6": "Community with riders across Kosovo",

    "shop.eyebrow": "Shop",
    "shop.title": "Wear the club colors.",
    "shop.lede": "The 2026 kit is in production. Pre-orders are open for members and supporters.",
    "shop.p1.name": "Season jersey",
    "shop.p1.tag": "Pre-order",
    "shop.p2.name": "Bib shorts",
    "shop.p2.tag": "Pre-order",
    "shop.p3.name": "Club casquette",
    "shop.p3.tag": "In stock",

    "support.eyebrow": "Support",
    "support.title": "No sponsors and donors, no race day.",
    "support.lede": "The club is a non-profit. Money goes to kits, travel, camps, and the youth academy.",
    "support.donate.title": "Make a donation",
    "support.donate.body": "One-off or monthly. Every euro goes to the youth program.",
    "support.donate.cta": "Donate now",
    "support.sponsor.title": "Become a sponsor",
    "support.sponsor.body": "Your logo on the kit, on the race van, and across our digital channels.",
    "support.sponsor.cta": "See sponsor tiers",

    "contact.eyebrow": "Contact",
    "contact.title": "Find us in Prishtina.",
    "contact.address": "Rruga e Maleve 14, 10000 Prishtina",
    "contact.email": "info@prishtina038.cc",
    "contact.phone": "+383 38 000 000",
    "contact.hours": "Training: Tue & Thu 18:00 · Sat 09:00",
    "foot.about": "Club",
    "foot.disciplines": "Disciplines",
    "foot.community": "Community",
    "foot.legal": "Membership · Privacy policy · UCI",
    "foot.tagline": "From road to trail. From Prishtina, for Kosovo.",
    "foot.copy": "© 2026 KÇ Prishtina 038 · All rights reserved",
    "foot.federation": "Registered with FÇK · ID: KS-22-038",

    "sec.mtb.eyebrow": "Section 02 · MTB",
    "sec.mtb.title": "Cross-country across Germia.",
    "sec.mtb.lede": "The second-largest section of the club, after Road. We train across Germia, Sharri and the Accursed Mountains, race the FÇK XCO calendar, and the regional marathon series.",
    "sec.mtb.spec.coach": "Head coach",
    "sec.mtb.spec.coach.v": "Blerton Krasniqi",
    "sec.mtb.spec.size": "Squad size",
    "sec.mtb.spec.size.v": "9 riders · 3 juniors",
    "sec.mtb.spec.training": "Training",
    "sec.mtb.spec.training.v": "Tue 18:00 · Sat 09:00 · Germia",
    "sec.mtb.spec.formats": "Formats",
    "sec.mtb.spec.formats.v": "XCO · Marathon · Enduro (experimental)",
    "sec.mtb.spec.season": "Season",
    "sec.mtb.spec.season.v": "April — October",
    "sec.mtb.spec.fee": "Membership / month",
    "sec.mtb.spec.fee.v": "€25 (reduced for U23)",
    "sec.mtb.cta": "Apply for MTB",
    "sec.mtb.h.calendar": "Season calendar",
    "sec.mtb.h.team": "Section riders",
    "sec.mtb.h.coach": "The coach",
    "sec.mtb.coach.body": "Blerton has 12 years in mountain biking, two-time national champion (2019, 2022) and a UCI Level 2 coach. He splits training into three seasonal blocks: base (Apr–May), intensity (Jun–Jul), race (Aug–Oct).",

    "secs.eyebrow": "Sections",
    "secs.title": "Six disciplines, one club.",
    "secs.lede": "Pick a section to see its coach, training schedule, race calendar, and current riders.",

    "evpage.eyebrow": "Calendar 2026",
    "evpage.title": "Every race and ride of the 2026 season.",
    "evpage.lede": "Filter by discipline, category or month. Members find their registrations on the personal panel.",
    "evpage.filter.all": "All",
    "evpage.filter.race": "Races",
    "evpage.filter.ride": "Open rides",
    "evpage.filter.camp": "Camps",

    "jp.eyebrow": "Membership",
    "jp.title": "Apply to join the club.",
    "jp.lede": "Fill out the form below. After you apply, the section coach will reach out within 5 business days.",
    "jp.form.name": "Full name",
    "jp.form.age": "Age",
    "jp.form.email": "Email",
    "jp.form.phone": "Phone",
    "jp.form.section": "Preferred section",
    "jp.form.exp": "Cycling experience",
    "jp.form.notes": "Additional notes",
    "jp.form.submit": "Submit application",
    "jp.exp.beg": "Beginner — less than 1 year",
    "jp.exp.int": "Intermediate — 1–3 years",
    "jp.exp.adv": "Racer — 3+ years",
    "jp.fee.title": "Membership",
    "jp.fee.body": "€20–35 per month depending on section and age. The youth academy is free for riders under 14.",
    "jp.proc.title": "How it works",
    "jp.proc.1": "Fill out the online application",
    "jp.proc.2": "The section coach reaches out for a trial training",
    "jp.proc.3": "Category and training times get set",
    "jp.proc.4": "Pick up your kit and start the season"
  }
};

const LangState = (() => {
  const LS_KEY = "kc038_lang";
  let current = localStorage.getItem(LS_KEY) || "sq";
  const subs = new Set();

  function get() { return current; }
  function set(l) {
    if (l !== "sq" && l !== "en") return;
    current = l;
    localStorage.setItem(LS_KEY, l);
    document.documentElement.setAttribute("lang", l === "sq" ? "sq" : "en");
    apply();
    subs.forEach(fn => fn(l));
  }
  function apply() {
    const dict = I18N[current] || I18N.sq;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll("[data-i18n-html]").forEach(el => {
      const key = el.getAttribute("data-i18n-html");
      if (dict[key] !== undefined) el.innerHTML = dict[key];
    });
    document.querySelectorAll(".lang-pill button").forEach(b => {
      b.classList.toggle("active", b.dataset.lang === current);
    });
  }
  function onChange(fn) { subs.add(fn); }
  return { get, set, apply, onChange };
})();

document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.setAttribute("lang", LangState.get());
  LangState.apply();
  document.querySelectorAll(".lang-pill button").forEach(b => {
    b.addEventListener("click", () => LangState.set(b.dataset.lang));
  });

  // Scroll reveal — subtle, modern. Auto-apply to common content blocks.
  if ("IntersectionObserver" in window) {
    const revealSelectors = [
      ".section-head",
      ".disc-card",
      ".rider",
      ".news-card",
      ".event-row",
      ".sponsor",
      ".support-card",
      ".pillar",
      ".tl-event",
      ".sec-row",
      ".price-card",
      ".stat"
    ];
    document.querySelectorAll(revealSelectors.join(",")).forEach(el => {
      if (!el.classList.contains("reveal")) el.classList.add("reveal");
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add("in-view");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    document.querySelectorAll(".reveal").forEach(el => io.observe(el));
  } else {
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("in-view"));
  }
});

/* ----- Countdown ----- */
function startCountdown(targetIso, elPrefix) {
  const target = new Date(targetIso).getTime();
  const $d = document.getElementById(elPrefix + "-d");
  const $h = document.getElementById(elPrefix + "-h");
  const $m = document.getElementById(elPrefix + "-m");
  const $s = document.getElementById(elPrefix + "-s");
  if (!$d) return;
  function pad(n) { return String(n).padStart(2, "0"); }
  function tick() {
    const ms = target - Date.now();
    if (ms <= 0) {
      $d.textContent = "00"; $h.textContent = "00";
      $m.textContent = "00"; $s.textContent = "00";
      return;
    }
    const sec = Math.floor(ms / 1000);
    $d.textContent = pad(Math.floor(sec / 86400));
    $h.textContent = pad(Math.floor((sec % 86400) / 3600));
    $m.textContent = pad(Math.floor((sec % 3600) / 60));
    $s.textContent = pad(sec % 60);
  }
  tick();
  setInterval(tick, 1000);
}
