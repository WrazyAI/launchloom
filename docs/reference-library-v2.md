# Reference Library v2 catalog

Reference Library v2 is the production visual-reference system used by the
creative compiler. The machine-readable source of truth is
`data/reference-library-v2.json`.

Every production entry has a unique LaunchLoom-owned desktop board, a unique
LaunchLoom-owned mobile board, structured design tags, a detailed
`designTemplate`, canonical Reference DNA, provenance metadata, target
industries, and a calibration profile.

## Library rules

- Keep at least 30 production references. The target expansion range is 40-50.
- Do not reuse a desktop or mobile evidence asset between reference IDs.
- Desktop and mobile evidence are both mandatory for production-tier entries.
- External galleries may inform provenance and design mechanics, but production
  evidence must be owned normalized material.
- Canonical Reference DNA is versioned and authoritative. Runtime analysis may
  verify evidence, but must not silently rewrite the template.
- Each reference must remain visually and structurally distinguishable from
  nearby families, not merely use a different palette.
- Industry tags express suitable adaptation targets, not the source site's
  original industry.
- A design may be explicitly requested by ID/name and still bypass rotation,
  but normal selection rotates recent IDs and families.

## Structured template contract

Each `designTemplate` defines:

1. `layoutArchetype`: the opening and page-composition grammar.
2. `navigationPattern`: the navigation's geometry and placement.
3. `servicePattern`: how services/capabilities are presented.
4. `surfaceSystem`: base, ink, accent, and light/dark mode.
5. `typeSystem`: display/body roles, scale ratio, microcopy behavior.
6. `imageSystem`: image role, crop, and focal intent.
7. `spacingSystem`: desktop/mobile gutters and section rhythm.
8. `conversionSystem`: primary/secondary action placement and form treatment.
9. `responsiveSystem`: mobile recomposition rules.
10. `doNot`: prohibited generic fallbacks.

Canonical Reference DNA adds exact hero/navigation geometry, section sequence,
motion/reduced-motion behavior, CTA placement, required DOM signatures,
acceptance checks, mobile rules, palette intent, and measured ratios.

## Current 30 references

| # | ID | Name | Target industries | Key tags | Family |
|---:|---|---|---|---|---|
| 01 | `kokoro-spatial-editorial` | Spatial Editorial Monument | architecture, interior-design, fine-jewelry, luxury-retail | nocturnal, editorial, tactile, luxury, centered, typographic | `editorial-monument` |
| 02 | `nightjar-cinematic-salon` | Nocturnal Salon | hospitality, fine-jewelry, luxury-retail, beauty | nocturnal, cinematic, intimate, luxury, full, bleed | `cinematic-salon` |
| 03 | `health-masked-mosaic` | Masked Clinical Mosaic | healthcare, dental, wellness, beauty | clean, precise, modern, calm, shared, image | `clinical-mosaic` |
| 04 | `skyelite-horizon` | Atmospheric Horizon | aviation, travel, hospitality, fine-jewelry, real-estate | premium, spacious, quiet, cinematic, centered, copy | `cinematic-horizon` |
| 05 | `digital-liquid-cinema` | Liquid Cinema | technology, creative-studio, entertainment, beauty | immersive, experimental, dark, cinematic, atmospheric, glass | `liquid-glass` |
| 06 | `viktor-studio-column` | Studio Column and Marquee | creative-studio, consulting, professional-services | minimal, personal, confident, editorial, narrow, authored | `studio-column` |
| 07 | `jack-3d-stacking` | Monument and Sticky Stack | portfolio, creative-studio, fashion, fitness | bold, kinetic, dark, experimental, oversized, wordmark | `sticky-stack` |
| 08 | `neo-museum-object-stage` | Object Museum Stage | museum, fine-jewelry, luxury-retail, fashion | curated, dramatic, scholarly, luxury, isolated, object | `museum-stage` |
| 09 | `prompt-fashion-archive` | Fashion Archive | fashion, fine-jewelry, beauty, luxury-retail | provocative, editorial, clean, experimental, type, image | `fashion-archive` |
| 10 | `neighborhood-table-collage` | Neighborhood Collage | food, hospitality, retail, community | warm, playful, local, tactile, asymmetric, layered | `market-collage` |
| 11 | `kinetic-club-program-bands` | Kinetic Program Bands | fitness, sports, automotive, performance | kinetic, bold, technical, energetic, full, viewport | `kinetic-bands` |
| 12 | `clear-counsel-ledger` | Quiet Expertise Ledger | legal, financial, consulting, engineering | restrained, precise, confidential, calm, portrait, proof | `expertise-ledger` |
| 13 | `a1-craft-collage-field` | Craft Collage Field | home-services, painting, remodeling, creative-studio, food | tactile, collage, playful, light, asymmetric, layered | `craft-collage` |
| 14 | `a1-scs-kinetic-command` | SCS Kinetic Command | home-services, hvac, electrical, security, professional-services | kinetic, technical, high-contrast, urgent, command, poster | `kinetic-command` |
| 15 | `a1-mckp-object-stage` | MCKP Object Stage | creative-studio, design, marketing, product, automotive | spatial, dark, technical, precise, isolated, object | `object-stage` |
| 16 | `a1-uncommon-founder-atlas` | Uncommon Founder Atlas | consulting, professional-services, coaching, finance | uncommon, dark, reflective, expressive, centered, founder | `founder-atlas` |
| 17 | `a1-ethan-cinematic-3d` | Ethan Cinematic Studio | creative-studio, design, technology, professional-services | cinematic, elegant, dark, spatial, 3d, field | `cinematic-3d` |
| 18 | `rapid-response-command` | Rapid Response Command | home-services, plumbing, hvac, electrical, restoration | urgent, credible, technical, direct, command, grid | `emergency-command` |
| 19 | `blueprint-service-ledger` | Blueprint Service Ledger | home-services, hvac, plumbing, electrical, engineering | technical, precise, trustworthy, structured, blueprint, ledger | `blueprint-ledger` |
| 20 | `craft-swatch-studio` | Craft Swatch Studio | home-services, painting, remodeling, interior-design | warm, tactile, craft, friendly, paint, swatch | `swatch-studio` |
| 21 | `roofline-editorial` | Roofline Editorial | home-services, roofing, construction | bold, architectural, reliable, premium, diagonal, roofline | `roofline` |
| 22 | `seasonal-yard-atlas` | Seasonal Yard Atlas | home-services, landscaping, lawn-care, outdoor | organic, seasonal, fresh, local, atlas, opening | `yard-atlas` |
| 23 | `neighborhood-route-map` | Neighborhood Route Map | home-services, local-business, cleaning, handyman, delivery | local, clear, friendly, practical, map, led | `route-map` |
| 24 | `garage-inspection-bay` | Garage Inspection Bay | automotive, repair, mechanical | precise, industrial, technical, trustworthy, service, bay | `inspection-bay` |
| 25 | `restoration-before-after` | Restoration Before / After | home-services, restoration, cleaning, painting, remodeling | transformative, clear, credible, visual, before, after | `before-after` |
| 26 | `warm-homecare-journal` | Warm Homecare Journal | home-care, senior-care, healthcare, wellness | reassuring, human, warm, editorial, care, journal | `care-journal` |
| 27 | `wellness-sanctuary-flow` | Wellness Sanctuary Flow | wellness, spa, therapy, beauty | calm, soft, sensory, premium, sanctuary, opening | `sanctuary-flow` |
| 28 | `dental-playful-tiles` | Dental Playful Tiles | dental, healthcare, orthodontics, family | bright, friendly, playful, clean, tile, opening | `playful-clinic` |
| 29 | `restaurant-menu-poster` | Restaurant Menu Poster | food, restaurant, hospitality, bar | bold, tactile, social, energetic, menu, poster | `menu-poster` |
| 30 | `property-listing-cinema` | Property Listing Cinema | real-estate, architecture, interior-design, hospitality | premium, visual, spacious, editorial, cinematic, property | `property-cinema` |

## Evidence layout

For each ID:

- Desktop: `data/inspiration-evidence/reference-v2/<id>/desktop.svg`
- Mobile: `data/inspiration-evidence/reference-v2/<id>/mobile.svg`

The loader validates that all 60 current evidence paths are unique and present.

## Expansion guidance

When growing from 30 to 40-50, prioritize genuinely new grammars rather than
palette variants. Useful next areas include reservation-led hospitality,
education/course editorial, ecommerce/product comparison, logistics/industrial,
pet care/veterinary, events/venues, construction/project case studies,
photography/creative portfolios, financial advisory, and boutique retail.

A proposed reference should be rejected if its hero geometry, navigation,
service treatment, typography role, mobile recomposition, and interaction model
are materially indistinguishable from an existing reference.
