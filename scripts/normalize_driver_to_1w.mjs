// One-off: shots / shot_distances の club='driver' を '1w' に正規化
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

for (const table of ["shots", "shot_distances"]) {
  const { data, error, count } = await db
    .from(table)
    .update({ club: "1w" }, { count: "exact" })
    .eq("club", "driver")
    .select("id");
  if (error) { console.error(table, error); continue; }
  console.log(`${table}: updated ${count ?? data?.length ?? 0} rows`);
}
