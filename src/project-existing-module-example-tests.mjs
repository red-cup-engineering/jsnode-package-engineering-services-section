import { admitRelativePosixFilepath } from "@red-cup-engineering/computer-filepath-engineering-services-section/admit-relative-posix-filepath";
import { isJsonValue } from "@red-cup-engineering/json-engine";
import { admitCell, cell, evidenced, sidesOf, specialize, told } from "@red-cup-engineering/signcell";
import { canonicalEqual } from "@red-cup-engineering/semiotic-content-address-system";
import { projectJsnodeExampleTests } from "./project-jsnode-example-tests.mjs";

function requireFields(record, allowed, required) {
  if (!record || typeof record !== "object" || Array.isArray(record)
      || Object.keys(record).some(key => !allowed.includes(key))
      || required.some(key => !Object.hasOwn(record, key))) {
    throw new TypeError(`Expected a JSON record with fields ${allowed.join(", ")} (required: ${required.join(", ")})`);
  }
}

function admitPath(path, label) {
  if (!Array.isArray(path) || !path.length || !path.every(segment =>
    typeof segment === "string" || (Number.isSafeInteger(segment) && segment >= 0))) {
    throw new TypeError(`${label} must name a property with string or nonnegative integer path segments`);
  }
}

function admitExample(example, positional, names) {
  requireFields(example, ["name", "input", "output", "throws", "outputPath", "mutateInput"], ["name", "input"]);
  if (typeof example.name !== "string" || !example.name.trim() || names.has(example.name)) {
    throw new TypeError("Each example needs a distinct nonempty name");
  }
  names.add(example.name);
  if (positional && !Array.isArray(example.input)) throw new TypeError("Positional input must be an array");
  if (Object.hasOwn(example, "throws")) {
    if (typeof example.throws !== "string" || !example.throws.trim()
        || ["output", "outputPath", "mutateInput"].some(key => Object.hasOwn(example, key))) {
      throw new TypeError("A refusal example expects an error name only");
    }
    return;
  }
  if (!Object.hasOwn(example, "output")) throw new TypeError("An example must specify output or throws");
  if (Object.hasOwn(example, "outputPath")) admitPath(example.outputPath, "outputPath");
  if (!Object.hasOwn(example, "mutateInput")) return;
  if (!Array.isArray(example.mutateInput) || !example.mutateInput.length) {
    throw new TypeError("mutateInput requires one or more replacements");
  }
  // Check each path against the input as it will stand after earlier replacements.
  const submitted = structuredClone(example.input);
  for (const replacement of example.mutateInput) {
    requireFields(replacement, ["path", "value"], ["path", "value"]);
    admitPath(replacement.path, "mutateInput.path");
    let target = submitted;
    for (const [index, key] of replacement.path.entries()) {
      if (target === null || typeof target !== "object" || !Object.hasOwn(target, key)
          || (Array.isArray(target) && !Number.isSafeInteger(key))) {
        throw new TypeError("mutateInput.path must select an existing JSON input member");
      }
      if (index + 1 === replacement.path.length) target[key] = structuredClone(replacement.value);
      else target = target[key];
    }
  }
}

// These specialize an expectation about a call. Its witnesses attest the
// specification; it takes a separate execution to observe the actual outcome.
const returns = "jsnode.example.returns";
const refuses = "jsnode.example.throws";

function declaredCell(example, operation, source) {
  if (example && Object.hasOwn(example, "predicate")) return admitCell(example);
  requireFields(example, ["name", "input", "output", "throws", "outputPath", "mutateInput"], ["name", "input"]);
  const field = Object.hasOwn(example, "throws") ? "throws" : "output";
  if (!Object.hasOwn(example, field)) throw new TypeError("An example must specify output or throws");
  const { [field]: expected, ...call } = example;
  const general = cell({ operation, ...call }, "jsnode.example.expects", expected);
  return evidenced(specialize(() => field === "throws" ? refuses : returns, general), { for: [source] });
}

/** Admit declared behavior once for both documentation and native tests. */
export function admitExistingModuleExamples(specification) {
  if (!isJsonValue(specification)) throw new TypeError("Expected a JSON example specification");
  const fields = ["name", "module", "exportName", "examples"];
  requireFields(specification, [...fields, "x-javascript-arguments"], fields);
  const {name, module, exportName, examples} = specification;
  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new TypeError("Expected a lowercase operation slug");
  if (typeof exportName !== "string" || !exportName.trim()) throw new TypeError("Expected a nonempty exportName");
  admitRelativePosixFilepath(module);
  if (!/\.[cm]?js$/.test(module) || /[%?#]/.test(module)) throw new TypeError("Expected a package-relative JavaScript module filepath");
  const mode = specification["x-javascript-arguments"];
  if (mode !== undefined && mode !== "positional") throw new TypeError("Expected positional or absent x-javascript-arguments");
  if (!Array.isArray(examples) || !examples.length) throw new TypeError("Expected one or more public behavior examples");
  const names = new Set();
  const operation = { module, exportName, ...(mode && { "x-javascript-arguments": mode }) };
  const declarations = examples.map(example => declaredCell(example, operation, { specification: name, ...operation }));
  const observations = declarations.map(declaration => {
    requireFields(declaration.subject, ["operation", "name", "input", "outputPath", "mutateInput"], ["operation", "name", "input"]);
    const { operation: target, ...call } = declaration.subject;
    if (!canonicalEqual(target, operation)) throw new TypeError("Example names a different operation");
    const [held, denied] = sidesOf(declaration);
    const [supported, opposed] = told(declaration);
    if (!held || denied || !supported || opposed) throw new TypeError("An example needs unopposed supporting testimony");
    if (declaration.predicate !== returns && declaration.predicate !== refuses) throw new TypeError("Unknown example predicate");
    const observation = declaration.predicate === returns
      ? { ...call, output: declaration.object }
      : { ...call, throws: declaration.object };
    admitExample(observation, mode === "positional", names);
    return observation;
  });
  return { ...specification, examples: observations, declarations };
}

/** Project executable observations of the admitted example declarations. */
export function projectExistingModuleExampleTests(specification) {
  const admitted = admitExistingModuleExamples(specification);
  return projectJsnodeExampleTests(admitted, admitted.examples, [], true);
}
