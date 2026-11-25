# Vertical live workflow

The existing workflow graph wraps a horizontal pipeline into multiple bands on
desktop. The owner requested a top-to-bottom view, automatic scrolling to the
latest stages, live node updates, and continued access to run error evidence.

## Design

- Use a downward dependency graph at every viewport. Pipeline depth advances
  vertically; sibling stages can share a row where there is room. Narrow screens
  stack siblings before the next depth. Connections never wrap to an earlier band
  or pass through intervening stage cards.
- Keep the graph in a bounded vertical scroll region. Follow latest starts enabled
  and keeps the most recent row plus preceding context visible. Scrolling away or
  selecting a stage pauses following; an explicit control resumes it. Automatic
  movement affects only the graph, never the drawer, page, or focused control.
- Use the existing authenticated attempt endpoint for live workflow evidence.
  Refresh sequentially every two seconds while queued/running, and every fifteen
  seconds after completion to pick up late reconciled diagnostics. Pause requests
  in hidden tabs and refresh on return. Abort on unmount or run change.
- Keep last-good evidence, manually selected stages, loaded older events and
  scroll position through updates and transient request errors. Incoming canonical
  evidence wins over older pages with the same event key. Show refresh health.
- Preserve skipped-stage inspection, structured diagnostic excerpts, failure codes,
  failure detail/next steps, pagination and exact-attempt GitHub links.

## Approach

Extend the existing React/SVG graph and attempt read model. A new graph dependency
would add unnecessary bundle and interaction changes. A plain timeline would lose
dependency branches. The chosen approach retains the existing node and evidence
components and changes layout, viewport behavior, and data refresh ownership.

## Scope and acceptance

No pipeline execution, generation thresholds, release policy, API authorization,
or raw-log collection changes. Validate actual browser geometry and interaction at
390px and desktop widths, active-to-terminal updates, failure evidence, connection
recovery and attempt isolation. Prepare a reviewable PR; merging/deploying awaits
the owner's shipping authorization.
