import { Fragment, type ReactNode } from "react";
import { KrugChip } from "./chips";
import { isKrugPrinciple } from "./krug";

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "p"; lines: string[] };

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) {
      blocks.push({ type: `h${heading[1].length}` as "h1" | "h2" | "h3", text: heading[2] });
    } else if (item) {
      if (last?.type === "ul") last.items.push(item[1]);
      else blocks.push({ type: "ul", items: [item[1]] });
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
  if (label === "Krug principle" && isKrugPrinciple(key)) {
    return (
      <>
        <span className="md-label">{label}</span> <KrugChip principle={key} />
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
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{labelled(it)}</li>
                ))}
              </ul>
            );
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
