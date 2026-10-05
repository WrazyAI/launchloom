# CI wait-time analysis: GitHub Actions vs Blacksmith

Date: 2026-10-05 (UTC)
Scope: all 11 workflows in `WrazyAI/launchloom`, 35 days of run data
Status: analysis complete, no CI configuration changed

## 1. The question

Will moving CI from GitHub Actions to Blacksmith produce meaningful benefits,
and what share of the time we spend waiting on CI is actually GitHub being
slow (runner queueing / slow runners) versus our own workloads running?

## 2. Method and evidence

- Pulled every workflow run from the GitHub Actions API: 1,201 runs,
  2026-08-31 to 2026-10-05, all 11 workflows.
- Pulled job-level data (queue time, execution time, runner labels, and step
  timings) for 1,198 of those runs: 1,317 jobs, 0 fetch failures.
- Queue is measured as `job.started_at - job.created_at` (runner pickup).
  Run-level queue (`run_started_at - created_at`) is always ~0 on GitHub and
  cannot be used; step durations come from the job steps payload.
- Raw data: `/tmp/opencode/ci-analysis/{runs.jsonl,jobs.jsonl}`.
- Blacksmith facts from live docs on 2026-10-05: blacksmith.sh/pricing,
  docs.blacksmith.sh `blacksmith-runners/overview`, `github-app`,
  `sticky-disks`, `dependencies-actions`. GitHub facts from the official
  runner reference, limits, and Actions pricing pages.

## 3. Where the waiting actually is

### 3.1 Runner queueing is negligible

Across 1,317 jobs (Depot-era runs excluded):

| metric | value |
| --- | --- |
| p50 queue | 3 s |
| p90 queue | 4 s |
| p95 queue | 5 s |
| p99 queue | 38 s |
| max queue | 2.2 min |
| jobs waiting > 60 s | 2 of 1,317 (0.15%) |
| total queue time | 1.38 h |
| queue share of job time | ~1.2% |
| peak concurrent jobs | 9 (plan cap: 20) |

Queue percentiles are flat across every hour of the day (all 24 UTC hours:
p50 3 s, p90 3 to 6 s). There is no peak-hour queueing problem, and no
concurrency-limit pressure. For a developer waiting on a PR, GitHub's pickup
latency is roughly 3 to 4 seconds out of a ~16 minute gate, about 0.4%.

The only long-queue event in the whole window was self-inflicted: on
2026-09-30 the three Depot CI migration runs stayed queued for exactly 24 h
(GitHub auto-cancels queued jobs at 24 h) because the Depot GitHub app was
never installed at the org level. That was not a GitHub capacity problem.

### 3.2 Execution is ~99% of the wait, and it is our test suite

Current PR gate (`Validate LaunchLoom changes`, success runs, last 14 days)
with step medians from the full window:

| step | median | notes |
| --- | --- | --- |
| checkout | 5 s (p90 44 s) | repo pack is 651 MiB |
| setup-node + npm ci | 15 s | GH cache makes npm ci only ~12 s |
| Playwright install | 24 s | browser download every job |
| **Run application tests** | **14.8 min on 2026-10-05** | 92% of the job |
| worker tests + Astro check + build | ~28 s | |
| **validate job total** | **~16 min today** | |
| route-fixtures: matrix step | **11.1 min** | ~88% of that job |
| route-fixtures job total | ~12.6 min | runs in parallel |

The application-test step is the whole story, and it is growing fast:

| day | median `Run application tests` |
| --- | --- |
| 2026-09-21 to 09-29 | 30 to 44 s |
| 2026-09-30 | 1.3 min |
| 2026-10-01 | 1.7 min |
| 2026-10-02 | 14.0 min |
| 2026-10-05 | 14.8 min (max 17.9 min) |

Confirmed by ledger entries the same day: CI validate passes at 17m23s and
16m9s with route-fixtures at 12m54s / 12m39s. PR CI is now ~10x slower than
it was two weeks ago, because the suite itself roughly 10x'd, not because
GitHub got slower.

### 3.3 Generation pipeline time is mostly model/API wait

`Generate client site` accounts for 74.8 h of job time in the window. Its
largest steps are authoring (median 7.6 min) and render-and-repair (median
12.4 min), both dominated by LLM/image/SEO provider calls and their retries.
Recent real intakes (`repository_dispatch`) have all been failing in the
creative stage (12 successes Sep 1-10, zero after Sep 10), and each failed
attempt still burns 20 to 47 min of runner time. Faster hardware does not
meaningfully shorten provider-bound waits.

## 4. What Blacksmith would and would not change

Blacksmith (as of 2026-10-05):

- Linux/Windows/macOS runners, Firecracker microVMs booting in < 3 s,
  unlimited concurrency, no queueing.
- Vendor claim: ~2x faster hardware (modern gaming CPUs) than GitHub's
  runners for most CI jobs; 400 MB/s co-located cache; git-checkout caching.
- Drop-in `runs-on: blacksmith-4vcpu-ubuntu-2404`; same base images.
- Pricing: $0.004/min for 2 vCPU (33% under GitHub's $0.006 2-core rate),
  scaling linearly; 4 vCPU ~ $0.008/min. 3,000 free 2-vCPU-equivalent
  minutes/month. Sticky disks/Docker caching cost extra ($0.50/GB/mo).
- Requires the org-level Blacksmith GitHub app (runner registration via
  GitHub's org runner API). This is the same integration class that failed
  for Depot on 2026-09-30.

Would fix:

- Job pickup: already ~3 s; saves seconds, not minutes.
- Execution on CPU-bound steps: tests, browser rendering, builds. Real but
  partial; browser-heavy suites are not purely CPU-bound, and the 2x claim
  is unverified for this workload.
- Checkout (~5 to 44 s) and Playwright install (~24 s) per job via checkout
  caching and sticky disks.

Would not fix:

- Our suite's size: 14.8 min of tests is workload, not platform. A 2x faster
  machine makes it ~7 to 10 min, not 1 min.
- LLM/API-bound generation waits (authoring, repair, SEO research), which
  are the majority of `Generate client site` time.
- Any billing benefit: standard runners on a public repo are currently $0.

Estimated effect on the PR gate (validate + route-fixtures in parallel),
assuming the vendor's CPU claim transfers 50 to 100%:

| scenario | validate job | route-fixtures | PR gate | saving per PR |
| --- | --- | --- | --- | --- |
| today (GitHub, 4 vCPU) | ~16 min | ~12.6 min | ~16 min | - |
| Blacksmith 4 vCPU, 1.25x | ~13 min | ~10.5 min | ~13 min | ~3 min |
| Blacksmith 4 vCPU, 1.5x | ~11 min | ~8.9 min | ~11 min | ~5 min |
| Blacksmith 4 vCPU, 2x | ~8.5 min | ~7 min | ~8.5 min | ~7.5 min |
| Blacksmith 8 vCPU (2x cores) | ~6 to 8 min | ~5 to 6 min | ~6 to 8 min | ~8 to 10 min |

### Cost

Current GitHub spend for this repo: $0 (public repo, standard runners,
unlimited minutes). Usage excluding the Depot incident: ~6,395 billed
4-vCPU-equivalent minutes per 30 days, and ~63% of those minutes are in the
LLM-bound generation pipeline.

| scenario | 4-vCPU min/mo | billable after 3,000 free 2-vCPU min | cost/mo |
| --- | --- | --- | --- |
| Blacksmith, same runtime | 6,395 | 4,895 | ~$39 |
| Blacksmith, 1.25x faster | 5,116 | 3,616 | ~$29 |
| Blacksmith, 1.5x faster | 4,263 | 2,763 | ~$22 |
| Blacksmith, 2x faster (vendor claim) | 3,198 | 1,698 | ~$14 |

So the realistic decision is: pay roughly $15 to $40/month to shorten the PR
gate by roughly 3 to 8 minutes (20 to 50%), or shorter if an 8 vCPU runner
is used and the suite parallelizes well. The generation pipeline would
barely move.

## 5. Cheaper levers that attack the actual bottleneck

Because minutes on public-repo standard runners are free and the plan cap is
20 concurrent jobs (peak observed: 9):

1. Shard `npm test` into 3 to 4 matrix shards. The 14.8 min step becomes
   roughly 4 to 5 min wall time at $0. Expected PR gate: ~6 to 8 min.
2. Shard the route-fixtures matrix (8 routes x 30 profiles x 3 recipes in one
   job, 11.1 min) per recipe or route group.
3. Add `concurrency: cancel-in-progress` to validate so stale pushes stop
   consuming and showing full-length runs (451 validate runs in 35 days).
4. Cache Playwright browsers with actions/cache keyed on the Playwright
   version (saves ~24 s/job), or keep that as a Blacksmith sticky-disk win.
5. Trim checkout cost (651 MiB pack; p90 44 s) if easy.

These changes target the same minutes Blacksmith would shorten, cost
nothing, and would still apply if Blacksmith is adopted later.

## 6. Recommendation

1. Do the free levers first (shard tests + route matrix, cancel stale runs).
   They are worth more wall time than the provider switch and cost $0.
2. Treat Blacksmith as a measured experiment, not a migration: install the
   org app, move only the two validate jobs to `blacksmith-4vcpu-ubuntu-2404`
   on a test branch, compare step medians over ~20 runs against this
   baseline, and then decide. Confirm the 4 vCPU rate and free-minute math
   with Blacksmith at signup; pricing here is derived from linear scaling.
3. Do not migrate the generation pipeline for speed reasons; its time is
   provider-bound. Migrate it only if total concurrency or larger-machine
   needs appear.
4. Resolve GitHub org app administration before any vendor migration
   (Depot precedent: missing org app = 24 h queued jobs, auto-cancelled).

## 7. Bottom line

GitHub's own queueing accounts for ~3 to 4 seconds per job, about 0.4% of
the current ~16 minute PR gate; ~99% of the wait is our workloads executing.
Blacksmith would likely shorten the CPU-bound test steps by 25 to 50%
(roughly 3 to 8 minutes per PR) at a new cost of ~$15 to $40/month, and would
barely help the model-bound generation pipeline. Sharding the test suite on
free GitHub runners is the largest and cheapest single win available, with
Blacksmith a reasonable follow-up if suite-driven wall time keeps growing.
