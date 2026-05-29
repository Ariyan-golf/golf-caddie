// One-off調査: shots / shot_distances の club カラム DISTINCT 値
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function distinct(table) {
  const { data, error } = await db.from(table).select("club");
  if (error) { console.error(table, error); return; }
  const counts = new Map();
  let nulls = 0;
  for (const row of data) {
    if (row.club == null) { nulls++; continue; }
    counts.set(row.club, (counts.get(row.club) ?? 0) + 1);
  }
  console.log(`\n== ${table} (rows=${data.length}, nulls=${nulls}) ==`);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [v, c] of sorted) console.log(`  ${JSON.stringify(v)}  x${c}`);
}

await distinct("shots");
await distinct("shot_distances");
