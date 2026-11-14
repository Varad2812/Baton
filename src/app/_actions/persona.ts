"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { PERSONA_COOKIE, PERSONAS } from "@/lib/authz";

const Input = z.enum(Object.keys(PERSONAS) as [keyof typeof PERSONAS, ...(keyof typeof PERSONAS)[]]);

/** Real (not a placeholder): switches the demo identity used by authz.ts. */
export async function setPersona(key: string) {
  const persona = Input.parse(key);
  const jar = await cookies();
  jar.set(PERSONA_COOKIE, persona, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  refresh();
  return { ok: true as const, persona };
}
