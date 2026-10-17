/** Retained Sites/D1 adapter, separate from Kairo's local server/store.mjs. */
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Return a Drizzle facade over the request's DB binding; no migration runs here.
 * Throws when the hosting binding is absent. See docs/PERSISTENCE.md for the
 * distinction between this opt-in scaffold and the shipped SQLite database.
 */
export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
