import { env } from "./env";
import { initDatabase } from "./db/connection";
import { runMigrations } from "./db/migrate";
import { startAllExtensions } from "./spindle/lifecycle";
import { initIdentity } from "./crypto/init";

// Resolve encryption identity (file > env migration > generate)
await initIdentity();

// Initialize database and run migrations synchronously
const db = initDatabase();
runMigrations(db);

// Dynamic import: auth modules call getDb() at module level, so must load after initDatabase()
const { seedOwner, backfillUserIds } = await import("./auth/seed");
await seedOwner();
backfillUserIds();

// Seed built-in tokenizers after migrations are applied
const { seedTokenizers } = await import("./services/tokenizer-seed");
seedTokenizers();

// Import app after database is ready (auth config needs getDb())
const { default: app, websocket } = await import("./app");

// Start extensions after app is imported but before serving —
// ensures extension macros are registered in the global registry
await startAllExtensions().catch((err) => {
  console.error("[Spindle] Failed to start extensions:", err);
});

console.log(`Lumiverse Backend starting on port ${env.port}...`);

export default {
  port: env.port,
  hostname: "::",
  fetch: app.fetch,
  websocket,
};
