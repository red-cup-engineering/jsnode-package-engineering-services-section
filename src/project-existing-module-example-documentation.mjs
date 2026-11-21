import { canonicalJson } from "@red-cup-engineering/json-engine";
import { admitTextFileCreationProjection } from "@red-cup-engineering/computer-file-engineering-services-section/admit-text-file-creation-projection";
import { renderMarkdownSectionDocument } from "@red-cup-engineering/markdown-engineering-services-section/render-markdown-section-document";
import { validateExistingModuleExamples } from "./project-existing-module-example-tests.mjs";

function inline(text) {
  const runs = text.match(/`+/g) ?? [];
  const fence = "`".repeat(runs.reduce((longest, run) => Math.max(longest, run.length), 0) + 1);
  const padding = /^`|`$/.test(text) || (/^ .* $/.test(text) && text.trim()) ? " " : "";
  return fence + padding + text + padding + fence;
}

function heading(text) {
  return text.replace(/\s+/gu, " ").trim().replace(/[!-/:-@\[-`{-~]/gu, "\\$&");
}

/** Render the same witnessed calls and expected outcomes used to generate native tests. */
export function projectExistingModuleExampleDocumentation(specification) {
  const { name, module, exportName, examples, declarations } = validateExistingModuleExamples(specification);
  const sections = [{ level: 1, title: name[0].toUpperCase() + name.slice(1).replaceAll("-", " "), body: "Behavior specified for " + inline(module + "#" + exportName) + "." }];
  for (const [index, example] of examples.entries()) {
    const lines = ["Input " + inline(canonicalJson(example.input))];
    if (example.mutateInput) lines.push("Caller replacements after the call " + inline(canonicalJson(example.mutateInput)));
    if (example.outputPath) lines.push("Observed result path " + inline(canonicalJson(example.outputPath)));
    lines.push(Object.hasOwn(example, "throws") ? "Expected error " + inline(example.throws) : "Expected return " + inline(canonicalJson(example.output)));
    lines.push("Declared by " + declarations[index].for.map(source => inline(canonicalJson(source))).join(", "));
    sections.push({ level: 2, title: heading(example.name), body: lines.join("\n\n") });
  }
  const file = admitTextFileCreationProjection({
    type: "TextFileCreationProjection", version: 1, mode: 0o644,
    path: "specifications/" + name + ".examples.md",
    text: renderMarkdownSectionDocument({ sections }),
  });
  if (file.type !== "TextFileCreationProjection") throw new TypeError(file.message);
  return file;
}
