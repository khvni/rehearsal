/**
 * Agent-skill sync gate: .devin/skills/rehearsal-testing/SKILL.md must document
 * every pipeline stage and every eval case file. A commit that adds a stage or
 * eval without updating the skill fails CI.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const skillPath = path.join(root, ".devin", "skills", "rehearsal-testing", "SKILL.md");
const skill = readFileSync(skillPath, "utf8");

const stageSrc = readFileSync(path.join(root, "src", "lib", "orchestrator.ts"), "utf8");
const stagesMatch = stageSrc.match(/PIPELINE_STAGES\s*=\s*\[([\s\S]*?)\]/);
const stages = stagesMatch
  ? [...stagesMatch[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1])
  : [];

const evalDir = path.join(root, "tests", "evals");
const evalFiles = readdirSync(evalDir).filter((f) => f.endsWith(".eval.ts"));

let failed = false;
for (const stage of stages) {
  if (!skill.includes(`stage: ${stage}`) && !skill.includes(`\`${stage}\``)) {
    console.error(`SKILL.md missing pipeline stage: ${stage}`);
    failed = true;
  }
}
for (const file of evalFiles) {
  if (!skill.includes(file)) {
    console.error(`SKILL.md missing eval case file: ${file}`);
    failed = true;
  }
}
for (const stage of stages) {
  if (!stageSrc.includes(`case "${stage}"`) && !new RegExp(`async ${stage}\\(`).test(stageSrc)) {
    console.error(`orchestrator missing stage implementation: ${stage}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nskill-sync check FAILED — update .devin/skills/rehearsal-testing/SKILL.md");
  process.exit(1);
}
console.log(`skill-sync OK: ${stages.length} stages, ${evalFiles.length} eval files documented`);
