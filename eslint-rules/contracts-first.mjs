/**
 * Shared types live in src/lib/contracts (AGENTS.md "Contracts first").
 * Flags exported type aliases, interfaces, enums, zod schemas and type re-exports
 * declared outside src/lib/contracts. React `*Props` types in .tsx files are allowed.
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

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) {
          const typeOnly =
            node.exportKind === "type" ||
            (node.specifiers.length > 0 && node.specifiers.every((s) => s.exportKind === "type"));
          if (typeOnly) context.report({ node, messageId: "typeReexport" });
          return;
        }
        if (decl.type === "TSTypeAliasDeclaration") report(decl.id, "type", decl.id.name);
        else if (decl.type === "TSInterfaceDeclaration") report(decl.id, "interface", decl.id.name);
        else if (decl.type === "TSEnumDeclaration") report(decl.id, "enum", decl.id.name);
        else if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (d.id.type === "Identifier" && d.init && isZodExpression(d.init)) report(d.id, "zod schema", d.id.name);
          }
        }
      },
    };
  },
};

export default contractsFirst;
