# Effective renderer fallback

The requested renderer is not always the renderer that can build. When a full
profile asks for creative but the production reference library has too few
business-matched dossiers, the run now switches to a renderer that can deliver a
preview instead of failing after authoring.

## Policy

| Requested | Profile | Condition | Effective |
| --- | --- | --- | --- |
| creative | full or full-preview | enough production references | creative |
| creative | full or full-preview | reference shortage | pack |
| creative | full or full-preview | reference shortage and no pack | foundation |
| creative | full or full-preview | no build possible | fail |
| creative | focused | reference shortage | fail, no silent switch |
| pack | full | pack id present | pack |
| pack | full | pack id missing | foundation, then fail |
| foundation | full | foundation id present | foundation |

Focused profiles never switch renderers because their report and evidence
contracts are renderer-specific. An unsupported business kind or a corrupt
registry still fails; only the known eligibility-shortage error triggers the
fallback.

## Preflight

`Resolve effective renderer` runs after intake and before reference
reservation. It reads the business kind and the already-selected pack from the
intake config, probes the reference library, and writes these values for the
rest of the job:

- `GENERATION_RENDERER`: the effective renderer.
- `PACK_ID` and `PACK_VARIANT`: the pack selected for the intake.
- `RENDERER_FALLBACK_REASON`: why the renderer changed.

Renderer-specific steps use `env.GENERATION_RENDERER`, so the deploy, marker
check, telemetry, and handoff all follow the effective renderer rather than the
requested one.

The fallback appears in the client review PR comment, the intake issue comment,
the developer preview email, and the operations handoff as
`renderer_fallback`.

## Inspect locally

```bash
npm run renderer:probe -- --industry wellness
npm run renderer:resolve -- --requested creative --profile full \
  --creative-references-available false --pack editorial-ledger
```

The probe reports `available`, the eligible dossier count when short, and the
reason. The resolver prints the effective renderer decision and exits non-zero
when no renderer can build.

## Scope

This increment recovers reference shortage before authoring. Authoring and
render failures inside the creative stage still use the existing recovery and
diagnostic paths. Extending the same effective-renderer decision across those
mid-job failures is a later increment.

## Mid-job authoring or render failure

When creative authoring, authored evidence, or creative rendering fails, the
job prepares the pack fallback in the same client checkout:

1. Read the pack selected by the intake.
2. Rewrite `design.experience` to that pack with `selectionMode: "pack-fallback"`.
3. Set `GENERATION_RENDERER=pack` and the fallback reason.
4. Let the normal preview step run with `always()`.

The pack branch then builds, verifies, and deploys the preview. The normal
handoff steps run whenever a preview exists, and the fallback is named in the
review comment, intake comment, developer email, and operations handoff.

The failed creative step remains visible in the run history, so the job
conclusion can stay failed even though the pack preview was delivered. The
delivery funnel counts the preview and the handoff, not the run conclusion.
Foundation fallback after a mid-job creative failure is not part of this
increment; the preflight can still choose foundation when no pack is available.
