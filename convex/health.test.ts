/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("/health says the database answers and where model calls go, and nothing else", async () => {
  const t = convexTest(schema, modules);
  const res = await t.fetch("/health", { method: "GET" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, database: true, models: "fallback" });
});
