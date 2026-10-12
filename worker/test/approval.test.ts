import fallback from "../../fixtures/seo-research/fallback-complete.json";
import { SELF, env, runInDurableObject } from "cloudflare:test";
import type { RevisionCoordinator } from "../src/revision-coordinator";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { network } from "./network";

const origin = "https://review-initial.example-client.pages.dev";

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

async function reviewToken() {
  const encoded = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        stage: "developer",
        repo: "WrazyAI/example-client",
        siteId: "example-client",
        reviewerEmail: "developer@example.com",
        clientEmail: "client@example.com",
        pr: 7,
        headSha: "review-head-sha",
        feedbackIssue: 8,
        expiresAt: Date.now() + 60_000,
        allowedOrigins: [origin],
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-review-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)),
  );
  return `${encoded}.${base64url(signature)}`;
}

beforeEach(async () => {
  const coordinator=(env as unknown as {REVISION_COORDINATOR:DurableObjectNamespace<RevisionCoordinator>}).REVISION_COORDINATOR.getByName('wrazyai/example-client');
  await runInDurableObject(coordinator,(_,state)=>{
    state.storage.sql.exec('DELETE FROM publications');
    state.storage.sql.exec('DELETE FROM revision_requests');
  });
  network.use(http.get('https://api.github.com/repos/WrazyAI/example-client/git/ref/heads/main',()=>HttpResponse.json({object:{sha:'approved-merge-sha'}})));
});

describe("developer approval", () => {
  it.each(["seo-only", "creative-only"])(
    "rejects %s at the signed reviewed commit without external writes",
    async (profile) => {
      let writes = 0;
      network.use(
        http.get(
          "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
          () =>
            HttpResponse.json({
              head: { sha: "review-head-sha" },
              state: "open",
              draft: false,
            }),
        ),
        http.get(
          "https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json",
          ({ request }) => {
            expect(new URL(request.url).searchParams.get("ref")).toBe(
              "review-head-sha",
            );
            return HttpResponse.json({
              encoding: "base64",
              content: btoa(
                JSON.stringify({
                  pipelineTest: { version: 1, profile, testOnly: true },
                  seoResearch: { mode: "researched", publishReady: true },
                }),
              ),
            });
          },
        ),
        http.put(
          "https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge",
          () => {
            writes++;
            return HttpResponse.json({ merged: true, sha: "approved" });
          },
        ),
        http.post(
          "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
          () => {
            writes++;
            return new HttpResponse(null, { status: 204 });
          },
        ),
      );
      const token = await reviewToken();
      const response = await SELF.fetch(
        "https://api.launchloom.test/api/approval",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({
            token,
            email: "developer@example.com",
            pageUrl: `${origin}/?review=${token}`,
          }),
        },
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: "pipeline_test_only",
      });
      expect(writes).toBe(0);
    },
  );
  it("retries publication after merge succeeds but the first dispatch fails", async () => {
    let merged = false;
    let mergeAttempts = 0;
    let dispatchAttempts = 0;
    const dispatchBodies: Array<Record<string, any>> = [];

    network.use(
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
        () =>
          HttpResponse.json(
            merged
              ? {
                  head: { sha: "review-head-sha" },
                  state: "closed",
                  draft: false,
                  merged: true,
                  merge_commit_sha: "approved-merge-sha",
                }
              : {
                  head: { sha: "review-head-sha" },
                  state: "open",
                  draft: false,
                  merged: false,
                  merge_commit_sha: null,
                },
          ),
      ),
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json",
        () =>
          HttpResponse.json({
            encoding: "base64",
            content: btoa(
              JSON.stringify({
                seoResearch: { mode: "researched", publishReady: true },
              }),
            ),
          }),
      ),
      http.put(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge",
        () => {
          mergeAttempts += 1;
          merged = true;
          return HttpResponse.json({
            merged: true,
            sha: "approved-merge-sha",
            message: "Pull Request successfully merged",
          });
        },
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        async ({ request }) => {
          dispatchAttempts += 1;
          dispatchBodies.push((await request.json()) as Record<string, any>);
          if (dispatchAttempts === 1)
            return HttpResponse.json(
              { message: "temporary dispatch failure" },
              { status: 503 },
            );
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );

    const token = await reviewToken();
    const request = () =>
      SELF.fetch("https://api.launchloom.test/api/approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify({
          token,
          email: "developer@example.com",
          pageUrl: `${origin}/?review=${token}`,
        }),
      });

    const first = await request();
    expect(first.status).toBe(200);
    const firstResult = await first.json() as {publicationId:string};
    const retry = await request();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({publicationId:firstResult.publicationId});
    expect(mergeAttempts).toBe(1);
    expect(dispatchAttempts).toBe(2);
    expect(dispatchBodies).toHaveLength(2);
    for (const body of dispatchBodies)
      expect(body).toMatchObject({
        event_type: "publish-site",
        client_payload: { approvedSha: "approved-merge-sha" },
      });
  });

  it("blocks unresolved business facts even when SEO research is ready", async () => {
    let externalWrites = 0;
    network.use(
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
        () =>
          HttpResponse.json({
            head: { sha: "review-head-sha" },
            state: "open",
            draft: false,
          }),
      ),
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json",
        () =>
          HttpResponse.json({
            encoding: "base64",
            content: btoa(
              JSON.stringify({
                factReadiness: {
                  version: 1,
                  launchReady: false,
                  addressVisibility: "private",
                  facts: [{ key: "services", state: "contradictory" }],
                },
                seoResearch: { mode: "researched", publishReady: true },
              }),
            ),
          }),
      ),
      http.put(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge",
        () => {
          externalWrites++;
          return HttpResponse.json({ merged: true });
        },
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          externalWrites++;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const token = await reviewToken();
    const response = await SELF.fetch(
      "https://api.launchloom.test/api/approval",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          token,
          email: "developer@example.com",
          pageUrl: `${origin}/?review=${token}`,
        }),
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "business_facts_required",
    });
    expect(externalWrites).toBe(0);
  });

  it("blocks approved supporting routes without content before merge or publication dispatch", async () => {
    let externalWrites = 0;
    network.use(
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
        () =>
          HttpResponse.json({
            head: { sha: "review-head-sha" },
            state: "open",
            draft: false,
          }),
      ),
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json",
        () =>
          HttpResponse.json({
            encoding: "base64",
            content: btoa(
              JSON.stringify({
                business: { description: "Supplied client description." },
                services: [],
                locations: [],
                routePolicy: {
                  version: 1,
                  decisions: [{ pageType: "privacy", status: "approved" }],
                },
                seoResearch: { mode: "researched", publishReady: true },
              }),
            ),
          }),
      ),
      http.put(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge",
        () => {
          externalWrites++;
          return HttpResponse.json({ merged: true });
        },
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          externalWrites++;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const token = await reviewToken();
    const response = await SELF.fetch(
      "https://api.launchloom.test/api/approval",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          token,
          email: "developer@example.com",
          pageUrl: `${origin}/?review=${token}`,
        }),
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "route_approval_required",
    });
    expect(externalWrites).toBe(0);
  });

  it("blocks unsupported page claims before merge or publication dispatch", async () => {
    let externalWrites = 0;
    network.use(
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
        () =>
          HttpResponse.json({
            head: { sha: "review-head-sha" },
            state: "open",
            draft: false,
          }),
      ),
      http.get(
        "https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json",
        () =>
          HttpResponse.json({
            encoding: "base64",
            content: btoa(
              JSON.stringify({
                business: { description: "Supplied client description." },
                services: [{name:"Drain cleaning",slug:"drain-cleaning",description:"A short service card."}],
                locations: [],
                routePolicy: {
                  version: 1,
                  decisions: [],
                },
                pageContent: {"service:drain cleaning":{introduction:{text:"Invented claim.",evidenceIds:[]}}},
                seoResearch: { mode: "researched", publishReady: true },
              }),
            ),
          }),
      ),
      http.put(
        "https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge",
        () => {
          externalWrites++;
          return HttpResponse.json({ merged: true });
        },
      ),
      http.post(
        "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
        () => {
          externalWrites++;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const token = await reviewToken();
    const response = await SELF.fetch(
      "https://api.launchloom.test/api/approval",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          token,
          email: "developer@example.com",
          pageUrl: `${origin}/?review=${token}`,
        }),
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "page_content_required",
    });
    expect(externalWrites).toBe(0);
  });

  it.each([
    {
      name: "measured research",
      research: { mode: "researched", publishReady: true },
      allowed: true,
    },
    { name: "completed cited fallback", research: fallback, allowed: true },
    {
      name: "partial fallback",
      research: {
        ...fallback,
        fallbackSearch: { ...fallback.fallbackSearch, status: "partial" },
      },
      allowed: false,
    },
    {
      name: "missing fallback citations",
      research: { ...fallback, externalSearchEvidence: [] },
      allowed: false,
    },
  ])(
    "publishes only the reviewed head with $name",
    async ({ research, allowed }) => {
      let mergeRequest: Record<string, unknown> = {};
      let dispatchRequest: Record<string, any> = {};

      network.use(
        http.get(
          "https://api.github.com/repos/WrazyAI/example-client/pulls/7",
          () =>
            HttpResponse.json({
              head: { sha: "review-head-sha" },
              state: "open",
              draft: false,
            }),
        ),
        http.get(
          "https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json",
          ({ request }) => {
            expect(new URL(request.url).searchParams.get("ref")).toBe(
              "review-head-sha",
            );
            const content = btoa(
              JSON.stringify({
                business: { name: "Example Client" },
                seoResearch: research,
              }),
            );
            return HttpResponse.json({ encoding: "base64", content });
          },
        ),
        http.put(
          "https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge",
          async ({ request }) => {
            mergeRequest = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({
              merged: true,
              sha: "approved-merge-sha",
              message: "Pull Request successfully merged",
            });
          },
        ),
        http.post(
          "https://api.github.com/repos/WrazyAI/launchloom/dispatches",
          async ({ request }) => {
            dispatchRequest = (await request.json()) as Record<string, any>;
            return new HttpResponse(null, { status: 204 });
          },
        ),
      );

      const token = await reviewToken();
      const response = await SELF.fetch(
        "https://api.launchloom.test/api/approval",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
          },
          body: JSON.stringify({
            token,
            email: "developer@example.com",
            pageUrl: `${origin}/?review=${token}`,
          }),
        },
      );

      if (!allowed) {
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code: "seo_research_required",
        });
        expect(mergeRequest).toEqual({});
        expect(dispatchRequest).toEqual({});
        return;
      }
      expect(response.status).toBe(200);
      expect(mergeRequest).toMatchObject({
        sha: "review-head-sha",
        merge_method: "squash",
      });
      expect(dispatchRequest).toMatchObject({
        event_type: "publish-site",
        client_payload: {
          repo: "WrazyAI/example-client",
          siteId: "example-client",
          clientEmail: "client@example.com",
          feedbackIssue: 8,
          approvedSha: "approved-merge-sha",
        },
      });
    },
  );
});

it("preserves feedback arriving while the approved merge is in flight", async () => {
  const {env}=await import('cloudflare:workers');
  let queued: unknown;
  const dispatched: string[]=[];
  network.use(
    http.get('https://api.github.com/repos/WrazyAI/example-client/pulls/7',()=>HttpResponse.json({head:{sha:'review-head-sha'},state:'open',draft:false})),
    http.get('https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json',()=>HttpResponse.json({encoding:'base64',content:btoa(JSON.stringify({seoResearch:{mode:'researched',publishReady:true}}))})),
    http.put('https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge',async()=>{
      queued=await env.REVISION_COORDINATOR.getByName('wrazyai/example-client').enqueue({requestId:'approval-race-feedback',fingerprint:'approval-race-feedback',stage:'developer',repo:'WrazyAI/example-client',pr:7,feedbackIssue:8,siteId:'example-client',clientEmail:'client@example.com',reviewedPage:origin,category:'Wording',feedback:'Please clarify the service scope.'});
      return HttpResponse.json({merged:true,sha:'approved-merge-sha'});
    }),
    http.get('https://api.github.com/repos/WrazyAI/example-client/git/ref/heads/main',()=>HttpResponse.json({object:{sha:'approved-merge-sha'}})),
    http.get('https://api.github.com/repos/WrazyAI/example-client/issues/7/comments',()=>HttpResponse.json([])),
    http.post('https://api.github.com/repos/WrazyAI/example-client/issues/7/comments',()=>HttpResponse.json({id:321})),
    http.post('https://api.github.com/repos/WrazyAI/launchloom/dispatches',async({request})=>{dispatched.push(String((await request.json() as {event_type:string}).event_type));return new HttpResponse(null,{status:204})}),
  );
  const token=await reviewToken();
  const response=await SELF.fetch('https://api.launchloom.test/api/approval',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token,email:'developer@example.com',pageUrl:origin+'/?review='+token})});
  expect(queued).toMatchObject({ok:true,queueStatus:'queued'});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({publicationId:expect.any(String)});
  expect(dispatched).toEqual(['publish-site']);
});


it("merges once when two approval requests overlap", async () => {
  let merges=0;
  network.use(
    http.get('https://api.github.com/repos/WrazyAI/example-client/pulls/7',()=>HttpResponse.json({head:{sha:'review-head-sha'},state:'open',draft:false})),
    http.get('https://api.github.com/repos/WrazyAI/example-client/contents/src/site.config.json',()=>HttpResponse.json({encoding:'base64',content:btoa(JSON.stringify({seoResearch:{mode:'researched',publishReady:true}}))})),
    http.put('https://api.github.com/repos/WrazyAI/example-client/pulls/7/merge',async()=>{merges++;await new Promise(resolve=>setTimeout(resolve,30));return HttpResponse.json({merged:true,sha:'approved-merge-sha'})}),
    http.post('https://api.github.com/repos/WrazyAI/launchloom/dispatches',()=>new HttpResponse(null,{status:204})),
  );
  const token=await reviewToken();
  const submit=()=>SELF.fetch('https://api.launchloom.test/api/approval',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token,email:'developer@example.com',pageUrl:origin+'/?review='+token})});
  const responses=await Promise.all([submit(),submit()]);
  expect(responses.map(r=>r.status)).toEqual([200,200]);
  const results=await Promise.all(responses.map(r=>r.json() as Promise<{publicationId:string}>));
  expect(results[0].publicationId).toBe(results[1].publicationId);
  expect(merges).toBe(1);
});
