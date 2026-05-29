// One-off調査: events テーブルの全レコードと golf_courses 名
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

const { data, error } = await db
  .from("events")
  .select("*, golf_courses(name)")
  .order("start_date", { ascending: true });

if (error) { console.error(error); process.exit(1); }

for (const ev of data) {
  console.log(JSON.stringify(ev, null, 2));
  console.log("---");
}
console.log(`\nTotal: ${data.length} events`);
