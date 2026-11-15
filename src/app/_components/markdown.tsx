import { Fragment, type ReactNode } from "react";
import { PrincipleChip } from "./chips";
import { findPrinciple } from "./principles";

type ListItem = { text: string; children: ListItem[] };

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "ul"; items: ListItem[] }
  | { type: "p"; lines: string[] };

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  const parents: { indent: number; items: ListItem[] }[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const item = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (!item) parents.length = 0;
    if (heading) {
      blocks.push({ type: `h${heading[1].length}` as "h1" | "h2" | "h3", text: heading[2] });
    } else if (item) {
      const indent = item[1].replace(/\t/g, "    ").length;
      while (parents.length > 1 && indent < parents[parents.length - 1].indent) parents.pop();
      if (last?.type !== "ul") {
        const items: ListItem[] = [];
        blocks.push({ type: "ul", items });
        parents.push({ indent, items });
      } else if (indent > parents[parents.length - 1].indent) {
        const siblings = parents[parents.length - 1].items;
        parents.push({ indent, items: siblings[siblings.length - 1].children });
      }
      parents[parents.length - 1].items.push({ text: item[2], children: [] });
    } else if (line.trim() === "") {
      blocks.push({ type: "p", lines: [] });
    } else if (last?.type === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ type: "p", lines: [line] });
    }
  }
  return blocks.filter((b) => b.type !== "p" || b.lines.length > 0);
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function labelled(text: string): ReactNode {
  const m = text.match(/^([A-Z][A-Za-z ]{0,24}):\s+(.*)$/);
  if (!m) return inline(text);
  const [, label, value] = m;
  const key = value.trim();
  const principle = label === "Principle" ? findPrinciple(key) : undefined;
  if (principle) {
    return (
      <>
        <span className="md-label">{label}</span> <PrincipleChip principle={principle} />
      </>
    );
  }
  return (
    <>
      <span className="md-label">{label}</span> {inline(value)}
    </>
  );
}

function heading(text: string): ReactNode {
  const effort = text.match(/^(.*?)\s*\[(S|M|L)\]$/);
  if (!effort) return inline(text);
  return (
    <>
      {inline(effort[1])} <span className="chip effort">effort {effort[2]}</span>
    </>
  );
}

function list(items: ListItem[]): ReactNode {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>
          {labelled(item.text)}
          {item.children.length > 0 && list(item.children)}
        </li>
      ))}
    </ul>
  );
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose">
      {parse(source).map((b, i) => {
        switch (b.type) {
          case "h1":
            return <h1 key={i}>{inline(b.text)}</h1>;
          case "h2":
            return <h2 key={i}>{inline(b.text)}</h2>;
          case "h3":
            return <h3 key={i}>{heading(b.text)}</h3>;
          case "ul":
            return <Fragment key={i}>{list(b.items)}</Fragment>;
          case "p":
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {labelled(l)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
