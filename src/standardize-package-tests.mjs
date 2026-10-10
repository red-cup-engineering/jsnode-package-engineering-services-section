/**
 * The STD-TEST codemod for one package: its `scripts.test` becomes the one standard command over the test plan
 * (`run-package-tests`, keeping the node flags the old command passed), and its `scripts.check` starts with
 * `check-package-syntax` in place of its hand-listed `node --check` calls, keeping every other step it chained.
 * A package whose test command is not a `node --test` form (forge, lake, guile, a custom runner, a build step
 * before the tests) is left as written and reported, for its owner to decide. Nothing is dropped from a plan:
 * the tests the old command did not run are reported as newly run.
 */

/** The standard test command, and the check command every standard check begins with. */
export const STANDARD_TEST = "run-package-tests";
export const STANDARD_CHECK = "check-package-syntax";
/** The package that carries both commands: the owner of the test plan. */
export const TEST_PLAN_PACKAGE = "@red-cup-engineering/jsnode-package-services-section";

const NODE_TEST = /^node((?:\s+--[\w-]+(?:=\S+)?)*)\s*(.*)$/u;
const NO_OP = /^(?:echo\b[^&|;]*(?:(?:&&|;)\s*exit 0)?|true|exit 0)$/u;

/** Whether a test command is the standard form: `run-package-tests` with node flags only. */
export function isStandardTest(command) {
  return typeof command === "string" && /^run-package-tests(?:\s+--[\w-]+(?:=\S+)?)*$/u.test(command.trim());
}
/** Whether a check command is the standard form: it begins with `check-package-syntax`. */
export function isStandardCheck(command) {
  return typeof command === "string" && /^check-package-syntax(?:\s|$)/u.test(command.trim());
}

/** A `node … --test …` command read as `{ flags, args }`, or null when it is not one. */
function nodeTestCommand(command) {
  const match = NODE_TEST.exec(command.trim());
  if (!match || /[;&|<>`$]/u.test(command) || !/(?:^|\s)--test(?=\s|$)/u.test(match[1])) return null;
  const flags = match[1].trim().split(/\s+/u).filter((flag) => flag && flag !== "--test");
  return { flags, args: match[2].trim() ? match[2].trim().split(/\s+/u) : [] };
}

const toPattern = (glob, shell) => new RegExp(`^${glob.replace(/^\.\//u, "").split("/").map((segment) => segment === "**"
  ? (shell ? "[^/]*" : "\u0000")
  : segment.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, "[^/]*").replace(/\?/gu, "[^/]")).join("/").replace(/\u0000\//gu, "(?:.*/)?").replace(/\u0000/gu, ".*")}$`, "u");

/**
 * The tests among `tests` an old `node --test` command ran. A quoted glob is node's (`**` recursive); an
 * unquoted one is the shell's, where `**` is `*`, and reaches node literally only when it matched nothing.
 * Bare `node --test` used node's own discovery, which reaches every plan test.
 */
export function testsRunBy(command, tests) {
  const parsed = nodeTestCommand(command ?? "");
  if (!parsed) return new Set();
  if (parsed.args.length === 0) return new Set(tests);
  const run = new Set();
  for (const raw of parsed.args) {
    const quoted = /^['"]/u.test(raw), arg = raw.replace(/^['"]|['"]$/gu, "").replace(/^\.\//u, "");
    if (!/[*?]/u.test(arg)) { for (const test of tests) if (test === arg || test.startsWith(`${arg.replace(/\/$/u, "")}/`)) run.add(test); continue; }
    let hits = quoted ? [] : tests.filter((test) => toPattern(arg, true).test(test));
    if (hits.length === 0) hits = tests.filter((test) => toPattern(arg, false).test(test));
    for (const test of hits) run.add(test);
  }
  return run;
}

/** The standard check for an old check command: its `node --check` steps become one `check-package-syntax`. */
function standardCheckFor(previous) {
  const steps = String(previous).split(/\s*&&\s*/u).map((step) => step.trim()).filter(Boolean);
  const kept = steps.filter((step) => !/^node\s+(?:--check|-c)\b/u.test(step) && step !== STANDARD_CHECK);
  return [STANDARD_CHECK, ...kept].join(" && ");
}

/**
 * Standardize one package's scripts against its test plan. `range` is the version range the package's
 * devDependency on the test-plan package gets. Returns `{ manifest, changed, test, check, newlyRun, kept }`.
 */
export function standardizePackageTests(manifest, plan, { range }) {
  if (manifest?.name === TEST_PLAN_PACKAGE) return { manifest, changed: false, test: null, check: null, newlyRun: [], kept: "the test plan's owner runs its own scripts directly" };
  const scripts = { ...(manifest.scripts ?? {}) };
  const previousTest = scripts.test, previousCheck = scripts.check;
  let test = null, check = null, kept = null, newlyRun = [];

  if (!isStandardTest(previousTest)) {
    const parsed = previousTest === undefined || NO_OP.test(previousTest.trim()) || /no tests/iu.test(previousTest) ? { flags: [], args: null } : nodeTestCommand(previousTest);
    if (!parsed) kept = `test command is not a node --test form: ${previousTest}`;
    else if (!(previousTest === undefined && plan.tests.length === 0)) {
      scripts.test = [STANDARD_TEST, ...parsed.flags].join(" ");
      test = { from: previousTest ?? null, to: scripts.test };
      const before = parsed.args === null ? new Set() : testsRunBy(previousTest, plan.tests);
      newlyRun = plan.tests.filter((path) => !before.has(path));
    }
  }
  if (!isStandardCheck(previousCheck) && !(previousCheck === undefined && plan.check.length === 0)) {
    scripts.check = previousCheck === undefined ? STANDARD_CHECK : standardCheckFor(previousCheck);
    check = { from: previousCheck ?? null, to: scripts.check };
  }
  if (!test && !check) return { manifest, changed: false, test, check, newlyRun, kept };

  const next = { ...manifest, scripts };
  const devDependencies = { ...(manifest.devDependencies ?? {}) };
  if (!manifest.dependencies?.[TEST_PLAN_PACKAGE] && devDependencies[TEST_PLAN_PACKAGE] === undefined) {
    devDependencies[TEST_PLAN_PACKAGE] = range;
    next.devDependencies = Object.fromEntries(Object.entries(devDependencies).sort(([a], [b]) => a.localeCompare(b)));
  }
  return { manifest: next, changed: true, test, check, newlyRun, kept };
}
