// Opt-in Sites/D1 scaffold only. Kairo's local SQLite schema and migrations are
// owned by server/store.mjs; see docs/PERSISTENCE.md before changing a database.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "sqlite",
});
