import type { ASTPath } from "jscodeshift";

export async function debugAST(ast: ASTPath[]) {
  const seen: unknown[] = [];

  const { writeFile } = await import("node:fs/promises");

  return writeFile(
    `ast.json`,
    JSON.stringify(ast, (_, val) => {
      if (val != null && typeof val == "object") {
        if (seen.indexOf(val) >= 0) {
          return;
        }
        seen.push(val);
      }
      return val;
    })
  );
}
