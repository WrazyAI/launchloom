import fs from "node:fs/promises";
import path from "node:path";
import { compileRouteInventory } from "../templates/client-site/src/lib/route-inventory.mjs";
const tokens = process.argv.slice(2);
const args = {};
for (let index = 0; index < tokens.length; index += 2) {
  const flag = tokens[index];
  const value = tokens[index + 1];
  if (
    !flag.startsWith("--") ||
    !value ||
    value.startsWith("--") ||
    !["--config", "--out"].includes(flag) ||
    args[flag.slice(2)]
  ) {
    throw new Error(
      "Invalid route inventory arguments: supply --config <file> and --out <file> once each.",
    );
  }
  args[flag.slice(2)] = value;
}
if (!args.config || !args.out)
  throw new Error(
    "Usage: compile-route-inventory.mjs --config site.config.json --out route-inventory.json",
  );
const config = JSON.parse(await fs.readFile(path.resolve(args.config), "utf8"));
const inventory = compileRouteInventory(config);
await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
await fs.writeFile(
  path.resolve(args.out),
  `${JSON.stringify(inventory, null, 2)}\n`,
);
console.log(
  `route_inventory_records=${inventory.records.length} issues=${inventory.issues.length}`,
);
// A report can be prepared for a blocked preview. Publication is enforced elsewhere.
