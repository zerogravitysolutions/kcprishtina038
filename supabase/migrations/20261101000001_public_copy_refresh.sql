-- Refresh public Albanian copy. Prices, schedules, IDs and program rules are unchanged.

-- Compare with the reviewed text so subsequent editorial changes are preserved.



UPDATE public.sections SET name_sq = 'Çiklizëm në pistë' WHERE slug = 'track' AND name_sq IS NOT DISTINCT FROM 'Trek';

UPDATE public.sections SET description_sq = 'Shpejtësi, teknikë dhe ritëm në velodrom. Disiplinat në pistë përfshijnë sprintin, keirin-in dhe ndjekjen.' WHERE slug = 'track' AND description_sq IS NOT DISTINCT FROM 'Disiplinë e shkurtër — sprint, keirin, persecution. Bashkëpunim me velodromin rajonal.';

UPDATE public.sections SET name_sq = 'MTB' WHERE slug = 'mtb' AND name_sq IS NOT DISTINCT FROM 'MTB';

UPDATE public.sections SET description_sq = 'Shtigje, ngjitje dhe teknikë në terren. Zhvillojmë aftësitë e çiklizmit malor dhe përgatitemi për gara cross-country dhe maratona.' WHERE slug = 'mtb' AND description_sq IS NOT DISTINCT FROM 'Cross-country në shtigjet e Germisë, Sharrit dhe Prokletijeve, me trajnerin Dorant Haxhidautin. Garojmë në kalendarin XCO të FÇK dhe në maratonat rajonale; çdo të shtunë grupi i hapur Germi Saturday.';

UPDATE public.sections SET name_sq = 'Gravel' WHERE slug = 'gravel' AND name_sq IS NOT DISTINCT FROM 'Gravel';

UPDATE public.sections SET description_sq = 'Eksplorojmë rrugët me zhavorr dhe rrugët dytësore, me ritëm që na lë hapësirë të shijojmë natyrën dhe shoqërinë.' WHERE slug = 'gravel' AND description_sq IS NOT DISTINCT FROM 'Seksioni më i ri, themeluar 2024. Më pak garë, më shumë eksplorim — ride 80–180 km nëpër rrugët dytësore të Kosovës dhe rajonit, me gravel race serie të përbashkët me Velo Tirana në 2026.';

UPDATE public.sections SET name_sq = 'Gra dhe vajza' WHERE slug = 'women' AND name_sq IS NOT DISTINCT FROM 'Femra';

UPDATE public.sections SET description_sq = 'Një mjedis mikpritës për gratë dhe vajzat që duan të pedalojnë. Ndajmë përvojën, stërvitemi së bashku dhe mbështesim synimet e secilës.' WHERE slug = 'women' AND description_sq IS NOT DISTINCT FROM 'Më shumë se një seksion — një rrjet. 11 çiklistë nëpër të gjitha disiplinat, me program mentorimi nga Shqiponja Osmani Pllana. Çdo të diel ride i hapur, me biçikleta për qira nga BikePlus.';

UPDATE public.sections SET name_sq = 'Çiklizëm rrugor' WHERE slug = 'road' AND name_sq IS NOT DISTINCT FROM 'Rrugë';

UPDATE public.sections SET description_sq = 'Stërvitje në rrugë, qëndrueshmëri dhe punë në ekip. Përgatitemi për garat kombëtare e rajonale dhe e mbështesim njëri-tjetrin gjatë rrugës.' WHERE slug = 'road' AND description_sq IS NOT DISTINCT FROM 'Seksioni i parë i klubit. Tre stërvitje në javë me trajnerin Albion Ymerin; kalendar i plotë FÇK, Granfondo i Sharrit dhe Prizrenit, plus etapat rajonale në Shqipëri e Maqedoninë e Veriut.';

UPDATE public.sections SET name_sq = 'Akademia e të rinjve' WHERE slug = 'youth' AND name_sq IS NOT DISTINCT FROM 'Akademia e të rinjve';

UPDATE public.sections SET description_sq = 'Një fillim i mirë në çiklizëm, me kujdes dhe mbështetje. Të rinjtë mësojnë teknikën, krijojnë besim në biçikletë dhe zbulojnë kënaqësinë e sportit.' WHERE slug = 'youth' AND description_sq IS NOT DISTINCT FROM 'Misioni më i rëndësishëm i klubit. 18 fëmijë midis 9 dhe 17 vjeç stërviten të shtunën në Germi, me dy tashmë në ekipin kombëtar U17. Gratis për moshat nën 14 vjeç.';

UPDATE public.membership_plans SET description_sq = 'Këshilla dhe plan stërvitjeje sipas nivelit tënd, për t’u ndjekur individualisht. Nuk përfshin mbikëqyrje të drejtpërdrejtë nga trajneri apo stërvitje në grup.' WHERE code = 'academy_1' AND description_sq IS NOT DISTINCT FROM 'Këshilla dhe plan stërvitjeje sipas nivelit tënd. Pa përcjellje nga trajneri dhe pa stërvitje të përbashkëta.';

UPDATE public.membership_plans SET description_sq = 'Mbështetje e drejtpërdrejtë nga trajneri dhe stërvitje në grup dy herë në javë, për t’u zhvilluar së bashku me ekipin.' WHERE code = 'academy_2' AND description_sq IS NOT DISTINCT FROM 'Trajner profesionist që të përcjell nga afër dhe stërvitje të përbashkëta dy herë në javë.';

UPDATE public.membership_plans SET description_sq = 'Për çiklistë me përvojë dhe nivel të zhvilluar garues. Pranimi bëhet pas vlerësimit të trajnerit. Nuk ka pagesë mujore ndaj klubit.' WHERE code = 'competition' AND description_sq IS NOT DISTINCT FROM 'Për garues me performancë të zhvilluar. Pa pagesë mujore ndaj klubit.';

UPDATE public.sponsors SET role_sq = 'Sponsor i përgjithshëm' WHERE id = '8874f60d-3dce-4661-81f9-c0f78fa1dd4c' AND role_sq IS NOT DISTINCT FROM 'Sponsor i pergjithshem';

UPDATE public.sponsors SET body_sq = 'Novus bashkon njohuritë dhe teknologjinë për t’i ndihmuar bizneset të zhvillohen. Faleminderit për mbështetjen që i jep klubit dhe rrugëtimit tonë sportiv.' WHERE id = '8874f60d-3dce-4661-81f9-c0f78fa1dd4c' AND body_sq IS NOT DISTINCT FROM 'Knowledge & Technology
CombinedTechnology is a powerful force for change. But without the guidance and knowledge on how to turn it into business value, it just remains raw power.

Novus has the knowledge, expertise, and experience to steer your company towards becoming a more agile organization.

Let Novus experts take care of the increasingly more complex technologies so you can redirect your energies to what you do best.';

UPDATE public.sponsors SET role_sq = 'Sponsor i përgjithshëm' WHERE id = '7f527781-5d1a-41d6-aa5a-9f70171815e1' AND role_sq IS NOT DISTINCT FROM 'Sponsor i pergjithshëm';

UPDATE public.sponsors SET body_sq = 'BikePlus ofron biçikleta, pajisje dhe aksesorë për çiklizëm e aktivitete në natyrë. Faleminderit që mbështet ekipin dhe komunitetin tonë të çiklizmit.' WHERE id = '7f527781-5d1a-41d6-aa5a-9f70171815e1' AND body_sq IS NOT DISTINCT FROM 'BikePlus KS është një kompani kosovare e specializuar në shitjen e pajisjeve dhe produkteve për sporte outdoor, me fokus të veçantë në çiklizëm, por edhe në aktivitete si hiking, vrapim, ski dhe aventura në natyrë. Kompania synon të ofrojë produkte cilësore dhe përvojë profesionale për sportistë rekreativë dhe profesionistë, duke përfshirë biçikleta, pjesë rezervë, veshje sportive, aksesorë dhe pajisje nga marka të njohura ndërkombëtare.

Me prani fizike në Prishtinë dhe platformë online për porosi, BikePlus shërben si një pikë e besueshme për komunitetin sportiv dhe të aventurës në Kosovë dhe rajon.';

UPDATE public.sponsors SET role_sq = 'Sponsor i përgjithshëm' WHERE id = 'd8b7ccb0-81a6-4cf2-ba05-79d684b39200' AND role_sq IS NOT DISTINCT FROM 'Sponsor Gjeneral';

UPDATE public.sponsors SET body_sq = 'BikePlus ofron biçikleta, pajisje dhe aksesorë për çiklizëm e aktivitete në natyrë. Faleminderit që mbështet ekipin dhe komunitetin tonë të çiklizmit.' WHERE id = 'd8b7ccb0-81a6-4cf2-ba05-79d684b39200' AND body_sq IS NOT DISTINCT FROM 'BikePlus KS është një kompani kosovare e specializuar në shitjen e pajisjeve dhe produkteve për sporte outdoor, me fokus të veçantë në çiklizëm, por edhe në aktivitete si hiking, vrapim, ski dhe aventura në natyrë. Kompania synon të ofrojë produkte cilësore dhe përvojë profesionale për sportistë rekreativë dhe profesionistë, duke përfshirë biçikleta, pjesë rezervë, veshje sportive, aksesorë dhe pajisje nga marka të njohura ndërkombëtare.

Me prani fizike në Prishtinë dhe platformë online për porosi, BikePlus shërben si një pikë e besueshme për komunitetin sportiv dhe të aventurës në Kosovë dhe rajon.';
