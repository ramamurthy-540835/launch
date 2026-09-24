const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "lib", "marketing-event-catalog.ts");
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleValue = { exports: {} };
new Function("exports", "require", "module", compiled)(moduleValue.exports, require, moduleValue);
const rows = moduleValue.exports.marketingEventCatalog;
// GoogleSQL uses a backslash-escaped quote inside a quoted string literal.
const quote = (value) => `'${String(value).replace(/'/g, "\\'")}'`;
const structs = rows.map((row) => `STRUCT(${quote(row.eventCatalogId)} AS event_catalog_id, ${quote(row.categoryId)} AS category_id, ${quote(row.categoryName)} AS category_name, ${row.subcategoryName ? quote(row.subcategoryName) : "CAST(NULL AS STRING)"} AS subcategory_name, ${quote(row.eventName)} AS event_name, ${row.audienceLevels.length ? `[${row.audienceLevels.map(quote).join(", ")}]` : "CAST([] AS ARRAY<STRING>)"} AS audience_levels)`).join(",\n  ");
const sql = `-- Generated from lib/marketing-event-catalog.ts. Re-run this file safely.\nMERGE \`YOUR_PROJECT_ID.school_lunch.marketing_event_catalog\` AS target\nUSING (\n  SELECT * FROM UNNEST([\n  ${structs}\n  ])\n) AS source\nON target.event_catalog_id = source.event_catalog_id\nWHEN MATCHED THEN UPDATE SET\n  category_id = source.category_id,\n  category_name = source.category_name,\n  subcategory_name = source.subcategory_name,\n  event_name = source.event_name,\n  audience_levels = source.audience_levels,\n  is_active = TRUE,\n  updated_at = CURRENT_TIMESTAMP()\nWHEN NOT MATCHED THEN INSERT (\n  event_catalog_id, category_id, category_name, subcategory_name, event_name, audience_levels, is_active, created_at, updated_at\n) VALUES (\n  source.event_catalog_id, source.category_id, source.category_name, source.subcategory_name, source.event_name, source.audience_levels, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()\n);\n`;
fs.writeFileSync(path.join(__dirname, "..", "infrastructure", "marketing-event-catalog-seed.sql"), sql);
console.log(`Generated ${rows.length} catalog rows.`);
