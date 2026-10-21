/**
 * Split additive DDL on top-level semicolons, preserving $$ function bodies and
 * ignoring full-line SQL comments. Test helper only; it never executes SQL.
 */
export function splitSqlStatements(source: string) {
  const statements: string[] = [];
  const withoutLineComments = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  let current = "";
  let dollarQuoted = false;
  for (let index = 0; index < withoutLineComments.length; index += 1) {
    if (withoutLineComments.startsWith("$$", index)) {
      dollarQuoted = !dollarQuoted;
      current += "$$";
      index += 1;
      continue;
    }
    const character = withoutLineComments[index];
    current += character;
    if (!dollarQuoted && character === ";") {
      statements.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter((statement) => {
    const withoutComments = statement
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim();
    return withoutComments.length > 0 && statement !== ";";
  });
}
