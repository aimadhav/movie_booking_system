import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the CineLoop recruiter demo", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>CineLoop — For the love of the big screen<\/title>/i,
  );
  assert.match(html, /THE BIG SCREEN/);
  assert.match(html, /Now showing/);
  assert.match(html, /system design lab/i);
  assert.match(html, /The Last Orbit/);
  assert.match(html, /Coming soon/);
  assert.match(html, /My tickets/);
  assert.match(html, /Find a theater/);
  assert.doesNotMatch(
    html,
    /codex-preview|react-loading-skeleton|Your site is taking shape/i,
  );
});

test("removes the disposable starter and keeps product metadata", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<CinemaApp \/>/);
  assert.match(layout, /CineLoop — For the love of the big screen/);
  assert.match(packageJson, /"name": "cineloop-web"/);
  assert.doesNotMatch(page, /codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(previewRoot));
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});

test("server-renders the separate payment reliability screen", async () => {
  const response = await render("/payment-lab");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Payment reliability lab/);
  assert.match(html, /Same event/);
  assert.match(html, /Stored/);
  assert.match(html, /Payment arrives too late/);
  assert.match(html, /Restore database state/);
  assert.match(html, /Offline walkthrough/);
});
