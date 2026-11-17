// A fixed, signed test visitor, so every Playwright context (and the `request` fixture) works on the
// SAME private copy of the demo, whose slug and id suffix are known up front. The signature uses the
// same key as the server (ENCRYPTION_KEY / ADMIN_TOKEN from .env); against a server with another
// key the cookie is ignored and the server issues its own visitor instead.
import "dotenv/config";
import { sandboxSlug, signVisitor, VISITOR_COOKIE } from "../src/lib/visitor";

export const TEST_VISITOR = process.env.TEST_VISITOR_ID ?? "baton-test-visitor-1";
export const SLUG = sandboxSlug(TEST_VISITOR);
/** Suffix of every seeded id in the test visitor's copy ("clm_auth_supabase" + SFX). */
export const SFX = `~${SLUG.slice(SLUG.lastIndexOf("-") + 1)}`;
export const id = (base: string) => `${base}${SFX}`;
/** SQL subquery for the test visitor's copy of the demo. */
export const DEMO_PROJECT = `(SELECT id FROM "Project" WHERE slug = '${SLUG}')`;

export function visitorState(baseURL: string) {
  return {
    cookies: [
      {
        name: VISITOR_COOKIE,
        value: signVisitor(TEST_VISITOR),
        domain: new URL(baseURL).hostname,
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    // The first-visit welcome modal is dismissed for tests that are not about it.
    origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "baton.welcome.v1", value: '{"choice":"test"}' }] }],
  };
}
