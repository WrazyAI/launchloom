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

Run `41114829311` (issue #217, OpenRouter, DeepSeek V4.1 Flash) completed
with `verdict: failed` and delivered a preview at
`https://23a385d0.launchloom-pipeline-preview.pages.dev`.

- `prepare` and `configure` passed; `author` passed; `creative` failed after
  the near-miss budget; `select` passed; `technical` failed; `deploy` passed.
- Selected fallback: `candidate-a` / `route-01` (Fixwell Quote-first Service
  Desk, utility-diagnostic, hero-integrated quote form). No candidate was
  eligible.
- Candidate scores:
  - candidate-a (route-01 Fixwell): reference 63, visual 58. Dimension
    scores: imagery 25, typography 50, hero geometry 55, service
    presentation 60, mobile recomposition 62, CTA 72, art direction 75,
    navigation 78, palette 90.
  - candidate-b (route-02 Roto-Rooter): reference 74, visual 72. Imagery 55,
    mobile 64, hero 70, service 74, typography 78, spatial 80, navigation 80,
    art direction 80, CTA 85, palette 90.
  - candidate-c (route-03 Morris-Jenkins): reference 74, visual 71. Imagery
    55, mobile 70, hero 72, typography 74, service 86, art direction 84,
    palette 88.
- Imagery: 15 requests, 0 placements. Every route skipped its hero, secondary,
  and tertiary assets. The reviewer returned `visible_text`,
  `logo_or_watermark`, `not_standalone_image`, and `review_unavailable`.
  The selected candidate has no photograph at all; its hero is a flat sage
  field. Candidate-b uses a line-art pipe diagram; candidate-c uses a
  line-art valve icon.
- Near-miss gate: candidate-c was blocked with four findings: truncated
  About and water-heater sentences, a bare plus sign appended to each FAQ
  question, and a duplicated `Portland` entry in the service-area list.
- Technical: 36 unresolved contrast findings and 6 hard failures. The
  reported flat pair `#6b716d` on `#e6efe5` measured 4.240 against 4.5 and
  was not repaired (`repairs=0`).
- Hero composition: candidate-b's desktop hero is a split stage with a
  line-art grid; its mobile hero bottom is 1226px, 1.45 viewports, with the
  media starting near y=690.
- The preview is Access-gated and noindex, as expected.

## Findings

1. **The utility layout language generalizes better than the ornate café
   reference.** Candidate-b reached reference 74 and visual 72, with strong
   palette (90), CTA (85), navigation (80), spatial rhythm (80), typography
   (78), and art direction (80). That is close to the dimension floors, not
   the 20 to 30 point gap seen on the café.
2. **Imagery is the dominant blocker.** Zero of fifteen requested assets
   were accepted, so every candidate substituted flat fields or line-art
   diagrams. The imagery score is 25 to 55 against a floor of 72. The
   references lead with a bright work-context image, a technician, a van,
   or a campaign poster; the candidates have none of that.
3. **The people-free policy conflicts with the technician-led references.**
   Roto-Rooter and Morris-Jenkins use a uniformed technician or a service
   van as the opening subject. The pipeline rejects any person in generated
   imagery, correctly, but the current fallback (a line-art pipe diagram)
   does not carry the reference's trust signal. A people-free photography
   strategy is needed: tools, pipes, workbenches, hands-off still lifes,
   service-van details without people or text.
4. **The image reviewer is also failing closed on some assets.** Several
   reviews returned `review_unavailable`, not a content rejection. That is
   a reliability failure in the review path, separate from the policy.
5. **Mobile recomposition is the second blocker.** Candidate-b's mobile
   hero is 1.45 viewports with the media below the fold; its mobile score
   is 64 against a floor of 78. The desktop layout is close; the mobile
   chapter is not.
6. **Copy integrity is a separate critical failure.** The copy lane
   truncated the About paragraph and the water-heater description mid
   sentence, and the FAQ control rendered the plus inside the question
   string. Those are content-integrity and control-affordance defects, not
   visual taste.
7. **Selection picked the weakest candidate.** The selected fallback is
   candidate-a (reference 63, visual 58) even though candidate-b scored
   74/72 and candidate-c 74/71. With no image-complete candidate, the
   fallback ranking should prefer the strongest visual score; the current
   `preferred` flag overrode it. This is a selection bug.
8. **The flat contrast repair did not apply.** The technical report shows
   a flat pair at 4.240 with zero repairs. The bounded repair path either
   was not reached on the selected candidate or did not cover the service
   pages. This is the same class as the café focus-state issue and needs a
   direct investigation, not another model repair.

## Recommendations

- Fix the image path before another creative run. The 0/15 placement rate
  is the dominant cause of the imagery floor failure. Separate the
  `review_unavailable` reliability failure from content rejections, and
  add a people-free plumbing still-life prompt set: pipe assemblies,
  tools, a workbench, a water heater detail, a van detail without livery.
- Make the fallback selection prefer the highest visual score when no
  candidate has image coverage. Candidate-b should have been selected.
- Add a mobile hero-fit contract for utility and poster routes: the media
  or diagnostic field must sit within the first viewport, not below the
  fold.
- Fix the copy truncation and the FAQ affordance in the copy lane. Treat
  truncated sentences as a hard authoring failure, not a visual finding.
- Investigate why the flat contrast repair applied zero repairs to the
  selected candidate's service pages.
- Re-run the plumbing review after the image and selection fixes. The
  layout is close enough that a pass is plausible; another run without the
  image fix will fail on imagery again.

## Addendum: run 41478356973 (2026-11-02)

Run `41478356973` (issue #217, OpenRouter, DeepSeek V4.1 Flash, commit
`1e734f8b`) completed after 2h40m with `verdict: failed` and delivered a
preview at `https://4c260519.launchloom-pipeline-preview.pages.dev`.

- `prepare`, `configure`, `author`, `creative`, `select`, `deploy`, `notify`,
  and `persist` passed; `technical` failed; `research`, `reuse`, and `seo` did
  not run in this profile.
- The dossier analyzer fallback worked. Route-02 (Roto-Rooter) returned
  `Reference analyzer returned no content` and continued with
  `analyzerModel=dossier-fallback`; route-01 and route-03 analyzed normally.
  Authoring started and completed instead of failing before the first model
  call.
- Imagery improved from 0/15 placements to 3 placements. Route-03's hero was
  approved, but route-01 and route-02 hero requests were skipped with
  `image-review-unavailable`. The selected route-02 used only a secondary
  placement; the rendered hero is a people-free plumbing still life.
- No candidate was valid: all three were `score: -1000` on contrast failures.
  Near-miss fallback selected candidate-b (typographic-poster), with visual
  gate overall 77 and 28 open findings. The gate recorded two major blockers:
  the light services panel repeats the section heading and intro with no
  service detail and a large blank area, and the FAQ area renders a bordered
  frame with only a play triangle and no poster, title, or caption.
  `promotionReady` is false; the creative stage passed only through the
  near-miss path, not as a green candidate.
- Mobile hero fit improved substantially: candidate-b's hero bottom is 877px
  against an 844px viewport (1.04 viewports), with media from 131px and 300px
  visible. This is just 33px over the fold, down from the previous 1.45
  viewports with media below the fold.
- Technical contrast failed with 15 unresolved findings and 0 repairs. The 15
  findings are five unique elements, one per service detail route: the same
  `h2` "What is happening, and what comes next" in the `focus` state. Its
  foreground is white on `#0f3d3e`, an actual ratio of 11.95:1 against the
  required 3:1. The audit marks it unresolved because
  `overlapping non-ancestor paint requires rendered review` and
  `repairEligible` is false. This is not a low-contrast pair; it is a
  state-scoping and rendered-proof gap.
- The dashboard's live candidate thumbnail did not upload. The stored hero
  endpoint returned 404 for both `github:41478356973:1` and `issue:217`. The
  focused reusable workflow sets `GENERATION_TRACKING_SECRET` but not
  `LAUNCHLOOM_API_URL`, `TRACK_PROFILE`, or `TRACK_ISSUE`, so
  `uploadLiveCandidatePreview` returns `tracking-disabled` or `no-generation-id`
  before any upload.

### Addendum findings

9. **The analyzer fallback is proven end to end.** A provider refusal on one
   route no longer kills the run before authoring.
10. **The image path is partly fixed, but the reviewer outage remains.** The
    people-free still-life prompt produces usable plumbing imagery, yet two of
    three hero requests never reached a verdict. The selected route therefore
    had no hero placement even though the rendered page uses a suitable
    secondary image.
11. **Near-miss creative is not a green creative pass.** Candidate-b is
    visually coherent and close to the reference language, but the hollow
    services panel and empty FAQ frame are real content-integrity defects, and
    28 findings remain open. Counting the near-miss as a pass hides them.
12. **The focus-state contrast failure is a gate defect.** One heading
    repeated across five routes, at 11.95:1, is reported unresolved only in the
    focus state. Non-default states collect out-of-scope text targets and then
    skip their rendered-pixel resolution, so a scroll-induced overlap finding
    fails the page even though the target's paint did not change.
13. **The live thumbnail feature is not wired for focused runs.** The code
    exists and is tested with synthetic env, but the workflow never supplies
    the API URL or the focused generation id, so no upload happens in practice.

### Addendum recommendations

- Resolve newly unresolved out-of-scope text targets from rendered pixels in
  non-default states, or carry the proven default verdict when the target's
  paint did not change. Do not fail a page for an element the interaction did
  not touch.
- Supply `LAUNCHLOOM_API_URL`, `TRACK_PROFILE`, and `TRACK_ISSUE` to the
  focused workflow, and add a test that uses those exact names so the live
  candidate path cannot regress silently.
- Remove the hollow services panel and the empty FAQ media frame, or require
  the content that fills them before the candidate can be selected.
- Make the image reviewer outage explicit in the image plan and retry beyond
  the current bound, so a route is not silently left without a hero.
- Re-run the plumbing review after these fixes. The layout, mobile hero, and
  imagery are now close enough that the remaining blockers are concrete.

### Addendum fix status

Commit `f7352523` fixes the focus-state contrast defect. Interaction states now
carry the default-state verdict per target, and a target that was clean in the
default state but becomes unresolved in a focus or hover state is proven from
that state's rendered pixels instead of being skipped as out of scope. Targets
that were already unresolved in the default state remain fail-closed.

The fix was verified on the actual selected Alder & Iron service page. The
pre-fix module produced exactly one unresolved focus finding for "What is
happening, and what comes next"; the fixed module produced zero findings and
passed. The new positive and fail-closed regression tests pass, and the six
contrast test files pass 128 tests.

Commit `c32fa415` adds deterministic rendered failures for the two content
placeholders: a purposeful selector whose default panel only repeats the
section heading and intro, and a media or poster frame with no image, label, or
caption. Both now fail the bakeoff before the visual judge, and the authoring
and repair prompts carry the same rules. On the selected candidate the detector
reports one hollow panel and one empty media frame on the home page, and zero
of both on the service detail page.

## Boundaries

This is an owned fictional QA intake. No public production, no invented
licenses, guarantees, prices, reviews, staff, opening hours, or physical
office, and no gate weakening.
