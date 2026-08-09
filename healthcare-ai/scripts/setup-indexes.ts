// Database optimization (Production Engineering). Adds a compound
// (userId, occurredAt) index to every journal class — every list query in
// lib/journal-client.ts filters on userId and sorts on occurredAt, so this is
// the index that actually matches real query patterns, not a guess.
//
// Run manually, once, by whoever holds the Back4App master key:
//   BACK4APP_MASTER_KEY=... npm run setup-indexes
//
// The master key is intentionally NOT part of the app's normal env var set
// (.env.local.example doesn't list it) — the deployed app never needs it and
// never reads it. This script is the one-off exception, run from a developer
// machine, not from a serverless function.
import { config } from "dotenv";
import path from "node:path";
config({ path: path.join(process.cwd(), ".env.local") });
import Parse from "parse/node";

const JOURNAL_CLASSES = ["SymptomEntry", "FunctionEntry", "TimelineAnchor", "ClinicalEncounter", "RashPhoto"];

async function main() {
  const appId = process.env.NEXT_PUBLIC_BACK4APP_APP_ID;
  const jsKey = process.env.NEXT_PUBLIC_BACK4APP_JS_KEY;
  const masterKey = process.env.BACK4APP_MASTER_KEY;

  if (!appId || !jsKey || !masterKey) {
    console.error(
      "Requires NEXT_PUBLIC_BACK4APP_APP_ID, NEXT_PUBLIC_BACK4APP_JS_KEY, and BACK4APP_MASTER_KEY.\n" +
        "Get the master key from Back4App Dashboard -> App Settings -> Security & Keys.\n" +
        "Pass it as an env var for this one run — do not add it to .env.local permanently\n" +
        "unless you're certain nothing else on this machine reads that file."
    );
    process.exit(1);
  }

  Parse.initialize(appId, jsKey, masterKey);
  (Parse as unknown as { serverURL: string; masterKey: string }).serverURL = "https://parseapi.back4app.com";

  for (const className of JOURNAL_CLASSES) {
    try {
      const schema = new Parse.Schema(className);
      // Master key is picked up implicitly from Parse.initialize's third
      // argument above — the Schema API doesn't take a per-call options object.
      await schema.get();
      schema.addIndex(`${className.toLowerCase()}_user_occurred`, { userId: 1, occurredAt: -1 });
      await schema.update();
      console.log(`  added (userId, occurredAt) index to ${className}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("already exists") || message.includes("Index already exists")) {
        console.log(`  ${className}: index already present, skipped`);
      } else {
        console.error(`  ${className}: FAILED — ${message}`);
      }
    }
  }
  console.log("Done. Connection pooling and backups are managed by Back4App at the platform level — nothing to configure here.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
