// The Management API returns only the final result set. Promote TAP failures to
// SQL exceptions so a rolled-back suite can never appear successful by omission.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

function statements(sql) {
  const result = [];
  let start = 0, quote = null, dollar = null, comment = null;
  for (let i = 0; i < sql.length; i++) {
    if (comment === "line") { if (sql[i] === "\n") comment = null; continue; }
    if (comment === "block") { if (sql.slice(i, i + 2) === "*/") { comment = null; i++; } continue; }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; } continue; }
    if (quote) {
      if (sql[i] === quote) { if (sql[i + 1] === quote) i++; else quote = null; }
      continue;
    }
    if (sql.slice(i, i + 2) === "--") { comment = "line"; i++; continue; }
    if (sql.slice(i, i + 2) === "/*") { comment = "block"; i++; continue; }
    if (sql[i] === "'" || sql[i] === '"') { quote = sql[i]; continue; }
    const tag = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
    if (tag) { dollar = tag; i += tag.length - 1; continue; }
    if (sql[i] === ";") { result.push(sql.slice(start, i).trim()); start = i + 1; }
  }
  if (sql.slice(start).trim()) result.push(sql.slice(start).trim());
  return result;
}
export function managementSuite(source) {
  let sql = source.replace(/^\\if :\{\?fixture_owner\}\n\\else\nselect current_user as fixture_owner \\gset\n\\endif\n/m, "");
  sql = sql.replace(/^\\ir \.\.\/fixtures\.sql$/m, () => readFileSync("supabase/tests/fixtures.sql", "utf8"));
  sql = sql.replaceAll(':"fixture_owner"', "postgres");
  if (/^\\/m.test(sql)) throw new Error("Unsupported psql directive for Management API verification.");
  let count = 0;
  const body = statements(sql).map(statement => {
    const stripped = statement.replace(/^(?:\s*--[^\n]*(?:\n|$))*/, "").trim();
    if (/^select (?:is|isnt|ok|throws_ok|lives_ok|like|unlike|results_eq|cmp_ok)\(/i.test(stripped)) {
      count++;
      return `select pg_temp.assert_tap((${stripped}))`;
    }
    if (/^select \* from finish\(\)$/i.test(stripped)) return "select pg_temp.assert_tap(t) from finish() t";
    if (/^begin$/i.test(stripped)) return `begin;
create temporary table rallyroute_management_marker(id integer);
create function pg_temp.assert_tap(t text) returns void language plpgsql as $assert$
begin if t like 'not ok%' or t like '# Looks like you failed%' then raise exception '%',t;end if;end $assert$`;
    return statement;
  }).join(";\n") + ";\n";
  if (!count) throw new Error("No supported TAP assertions found.");
  return { sql: body, count };
}
export function runManagementSuite(file, source) {
  const { sql, count } = managementSuite(source);
  const directory = mkdtempSync(join(tmpdir(), "rallyroute-db-tests-"));
  try {
    const path = join(directory, "suite.sql");
    writeFileSync(path, sql, { mode: 0o600 });
    const result = spawnSync("pnpm", ["supabase", "db", "query", "--linked", "--file", path], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      console.error(`${file}: FAILED via linked Management API. Provider output suppressed; inspect the transaction-only suite in a secure terminal.`);
      return false;
    }
    console.log(`${file}: ${count} assertions passed via linked Management API (rolled back).`);
    return true;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
