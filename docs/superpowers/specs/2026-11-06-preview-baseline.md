# Preview delivery baseline

Recorded 2026-11-06 before the preview-first slice was deployed.

## Run success rate

Command, run from the shared checkout at deployed commit `8547ebf2` on
2026-11-05:

```text
npm run report:generation-success
```

Output for the last 100 generation runs:

```text
unknown        2/75    2.7%  failed=70 cancelled=3 other=0
creative       1/21    4.8%  failed=18 cancelled=1 other=1
pack           3/4      75%  failed=1 cancelled=0 other=0
overall        6/100 6%
```

This metric counts only the GitHub run conclusion. It does not distinguish a
clean preview, a warned preview, a diagnostic preview, or a preview that did not
load.

## Trace proof

Attempt `d16920cc-3be4-4528-b80f-905f658147df` produced a complete activity
trace on 2026-11-05 at about 20:14Z:

- 22 retained events across coverage, model start and finish, heartbeat, output,
  usage, and producer finish.
- 2 model responses.
- 4,982 input tokens and 15,544 output tokens.
- Recording state complete.
- The generation itself failed at the wellness reference-library eligibility
  gate and produced no preview.

## Delivery log line

The creative deploy path now emits:

```text
generation_delivery=clean
generation_delivery=warned
generation_delivery=reject
generation_warnings=<count>
```

`clean` means the strict gate passed with no findings. `warned` means the
near-miss path carried only open design findings. `reject` means a hard finding,
a critical finding, a missing report, or an unsafe selection blocked delivery.
`generation_warnings` is the count of open findings on the decision.

The delivered-preview rate is not measurable until runs after this slice emit
the line. The next funnel step parses these lines together with the run
conclusion and the attempt identity.
