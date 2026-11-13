/**
 * Shared types live in src/lib/contracts (AGENTS.md "Contracts first").
 * Flags exported type aliases, interfaces, enums, zod schemas and type re-exports
 * declared outside src/lib/contracts, including `export { X }` of a local one.
 * React `*Props` types in .tsx files are allowed.
 */

function isZodExpression(node) {
  let cur = node;
  while (cur) {
    if (cur.type === "CallExpression") cur = cur.callee;
    else if (cur.type === "MemberExpression") cur = cur.object;
    else if (cur.type === "TSAsExpression" || cur.type === "TSSatisfiesExpression") cur = cur.expression;
    else break;
  }
  return cur?.type === "Identifier" && cur.name === "z";
}

/** @type {import("eslint").Rule.RuleModule} */
const contractsFirst = {
  meta: {
    type: "problem",
    docs: { description: "Exported types and zod schemas must live in src/lib/contracts" },
    schema: [],
    messages: {
      moveToContracts:
        "Exported {{kind}} '{{name}}' belongs in src/lib/contracts (AGENTS.md: contracts first). Move it there, or drop `export` if it is module-private.",
      typeReexport:
        "Type re-export outside src/lib/contracts. Import shared types from '@/lib/contracts' instead.",
    },
  },
  create(context) {
    const isTsx = context.filename.endsWith(".tsx");
    const allowed = (name) => isTsx && name.endsWith("Props");
    const report = (node, kind, name) => {
      if (!allowed(name)) context.report({ node, messageId: "moveToContracts", data: { kind, name } });
    };

    /** Kind of each top-level declaration that would be a contract if exported. */
    const contractKinds = new Map();
    const kindOf = (decl) => {
      if (decl.type === "TSTypeAliasDeclaration") return [[decl.id, "type"]];
      if (decl.type === "TSInterfaceDeclaration") return [[decl.id, "interface"]];
      if (decl.type === "TSEnumDeclaration") return [[decl.id, "enum"]];
      if (decl.type === "VariableDeclaration") {
        return decl.declarations
          .filter((d) => d.id.type === "Identifier" && d.init && isZodExpression(d.init))
          .map((d) => [d.id, "zod schema"]);
      }
      return [];
    };

    return {
      Program(program) {
        for (const stmt of program.body) {
          const decl = stmt.type === "ExportNamedDeclaration" ? stmt.declaration : stmt;
          if (decl) for (const [id, kind] of kindOf(decl)) contractKinds.set(id.name, kind);
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind === "type") context.report({ node, messageId: "typeReexport" });
      },
      ExportNamedDeclaration(node) {
        if (node.declaration) {
          for (const [id, kind] of kindOf(node.declaration)) report(id, kind, id.name);
          return;
        }
        for (const spec of node.specifiers) {
          if (node.exportKind === "type" || spec.exportKind === "type") {
            context.report({ node: spec, messageId: "typeReexport" });
          } else if (!node.source && spec.local.type === "Identifier" && contractKinds.has(spec.local.name)) {
            report(spec, contractKinds.get(spec.local.name), spec.local.name);
          }
        }
      },
    };
  },
};

export default contractsFirst;
