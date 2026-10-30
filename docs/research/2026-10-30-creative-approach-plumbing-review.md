# Creative approach review: plumbing cross-niche test

Date: 2026-10-30

Status: run dispatched, evidence pending

## Purpose

The café concept exposed a specific failure pattern: the pipeline could pass
technical gates but could not reach the rendered reference-fidelity floors on
an ornate, atmospheric hospitality reference. This review tests whether that
failure is reference-specific or systemic by running the same creative
pipeline on a different business kind with a different reference language.

The test uses a new owned fictional intake, not an existing client:

- Issue: `#217`
- Business: Alder & Iron Plumbing Co.
- Location: Beaverton, OR
- Services: emergency leak repair, drain cleaning, water heater replacement,
  repiping, fixture installation
- Brand: deep teal `#0f3d3e`, brass `#c9a86a`
- Differentiators: process only, no invented credentials, guarantees, prices,
  reviews, staff, or response times
- Run: creative-only `41083094486`

## Method

The run uses the existing creative-only profile:

1. Prepare and configure the intake.
2. Author three candidates from the assigned reference routes.
3. Bake off the candidates with the rendered reference-fidelity judge.
4. Repair the closest candidates within the bounded rounds.
5. Select the best candidate, run the technical gates, and deliver a preview.

The review inspects the authoring result, the selected reference, the rendered
candidate, the technical and creative gates, the hero composition, both mobile
actions, and the preview.

## Plumbing reference language

The plumbing references in the library are not variations of the café
reference. They fall into two families.

### Utility-diagnostic

- **Urgent Trade Service Poster**: problem poster beside a high-visibility
  geometric signal, heavy industrial grotesk, problem-first diagnostic index.
- **Spicer Plumber Dispatch Console**: emergency promise beside a dispatch
  console, condensed technical sans, three-path triage and a flat-rate table.
- **Fixwell Quote Desk**: hero-integrated quote form, bold practical grotesk,
  problem-oriented service index, postcode lookup and scope slider.

### Typographic-poster

- **Morris-Jenkins**: deep-blue campaign poster, uniformed technician beside a
  home-comfort promise and a yellow schedule control, large service tiles with
  pictograms.
- **Roto-Rooter**: pale-lavender split stage, service van and technician, a
  large phone number and ZIP finder, illustrated service tiles.

Both families are conversion-first. The reference expects a visible phone,
ZIP, quote, or schedule control near the opening. The service section is a
triage or diagnostic index, not a generic card wall.

## Expected pressure points

These are hypotheses to test against the run evidence, not conclusions.

### 1. People-free imagery versus technician-led references

The pipeline hard-rejects any generated image containing a person, face,
hands, or body parts. That rule exists so stock people are never presented as
staff or customers. But the strongest plumbing references use a uniformed
technician or a service van as the opening subject. The Morris-Jenkins and
Roto-Rooter references depend on that human trust signal.

The model must substitute equipment, tools, vans, or interiors without people.
If it selects a technician-led reference, the imagery and art-direction scores
may fail even when the layout is correct. A utility-diagnostic reference that
leads with a console or poster may be the only plumbing route the current
imagery policy can reproduce faithfully.

### 2. Service presentation

The plumbing references use problem-first indexes, triage paths, flat-rate
tables, and service tiles. The authoring prompt asks for a non-card service
treatment and passes the reference's service-presentation pattern, but the
model may still default to generic rows or cards. The café run scored 57
against a floor of 75 on service presentation, so this dimension is already
weak.

The review should check whether the authored service section actually performs
triage, or whether it merely lists services with descriptions.

### 3. Typography

Plumbing references use heavy grotesks, condensed technical sans, and bold
practical type. The café run defaulted to an ornate serif and script hierarchy
that scored well below the typography floor. If the model again defaults to a
serif editorial voice, the typography dimension will fail even on plumbing.

### 4. Conversion mechanics

The pipeline requires a compact early-conversion anchor to the contact
section. The plumbing references expect a phone number, ZIP finder, quote
form, or schedule control in the opening. The `utility-panel` topology can
place a form in the hero, but the exact plumbing conversion mechanic may not
survive the generic early-conversion contract.

The review should check whether the selected candidate keeps the phone, quote,
or schedule action visible at 390x844, and whether the service area or ZIP
mechanic exists at all.

### 5. Reference selection

The pipeline assigns a route and reference from the inspiration pack. The
selected family determines whether the run is judged against a
utility-diagnostic reference it can reproduce or a technician-led
typographic-poster reference it cannot. The review should record the selected
route, family, and reference before judging the candidate, because a poor
reference match is an upstream selection problem, not only an authoring
problem.

## Run evidence

To be filled from run `41083094486`:

- Author result and stage durations
- Selected route, family, and reference dossier
- Candidate scores and dimension scores
- Technical gate results
- Creative gate results and findings
- Hero composition at desktop, compact, and mobile
- Both mobile actions at 390x844
- Preview URL
- Asset placements and review reasons

## Findings

To be written after inspection.

## Recommendations

To be written after inspection. The recommendations will distinguish:

- reference-selection problems
- authoring-prompt problems
- gate or measurement problems
- imagery-policy problems that are intentional and need a design response
- genuine model-capability limits

## Boundaries

This is an owned fictional QA intake. No public production, no invented
licenses, guarantees, prices, reviews, staff, opening hours, or physical
office, and no gate weakening.
