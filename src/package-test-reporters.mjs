/**
 * Compose the Node test runner's reporter bindings before adding a receiving
 * reporter. NODE_OPTIONS and command-line options form one ordered binding
 * list; Node's implicit stdout destination applies only to one lone reporter.
 */

// Node's NODE_OPTIONS grammar is not a shell grammar. This follows the public
// runtime source's ParseNodeOptionsEnvVar: ASCII spaces delimit outside double
// quotes, and a backslash escapes the next character only inside double quotes.
// Single quotes and backslashes outside double quotes are literal characters.
// https://github.com/nodejs/node/blob/v24.22.1/src/node_options.cc
function environmentArguments(text) {
  const words = [];
  let quoted = false, start = true;
  for (let index = 0; index < text.length; index += 1) {
    let character = text[index];
    if (character === "\\" && quoted) {
      if (++index === text.length) throw new TypeError("NODE_OPTIONS has an invalid trailing escape");
      character = text[index];
    } else if (character === " " && !quoted) {
      start = true;
      continue;
    } else if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (start) { words.push(character); start = false; }
    else words[words.length - 1] += character;
  }
  if (quoted) throw new TypeError("NODE_OPTIONS has an unterminated double-quoted string");
  return words;
}

function reporterCounts(args) {
  let reporters = 0, destinations = 0;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") throw new TypeError("Reporter composition accepts Node options before the -- delimiter only");
    const equals = argument.indexOf("=");
    const name = (equals === -1 ? argument : argument.slice(0, equals)).replaceAll("_", "-");
    if (name !== "--test-reporter" && name !== "--test-reporter-destination") continue;
    const value = equals === -1 ? args[++index] : argument.slice(equals + 1);
    // Native Node refuses a separate operand beginning '-'. An equals-form
    // value may contain reporter-looking text without becoming another option.
    if (!value || (equals === -1 && value.startsWith("-"))) {
      throw new TypeError(`${name} requires an argument`);
    }
    if (name === "--test-reporter") reporters += 1;
    else destinations += 1;
  }
  return { reporters, destinations };
}

const nonemptyString = value => typeof value === "string" && value.length > 0 && !value.includes("\0");

/**
 * Retain the original Node reporter bindings and append explicit receiving
 * bindings. The combined inherited and command-line configuration is validated
 * before any addition: zero bindings receive the default reporter on stdout;
 * one reporter without a destination receives its implicit stdout; every other
 * original configuration must have equal reporter and destination counts.
 * Other Node options are preserved for Node itself to validate and execute.
 *
 * @param {object} [options] Original Node options and additional receiving reporters.
 * @param {string[]} [options.arguments] Node option tokens before --test and file selectors; shell quoting is already decoded.
 * @param {string} [options.nodeOptions] The original NODE_OPTIONS string, interpreted without changing it or the environment.
 * @param {{reporter: string, destination: string}[]} [options.additionalReporters] Ordered reporter/destination pairs to append after validating the original bindings.
 * @param {string} [options.defaultReporter] Reporter used only when neither channel declares a binding; defaults to tap.
 * @returns {Readonly<{arguments: readonly string[], appendedArguments: readonly string[]}>} Frozen complete arguments and the appended suffix alone. The suffix contains any explicit default/stdout binding followed by each added --test-reporter and --test-reporter-destination pair. Append only that suffix when the original arguments are already supplied by an npm script.
 * @throws {TypeError} For malformed input, ambiguous NODE_OPTIONS quoting, a -- delimiter, missing reporter operands, or invalid original reporter/destination cardinality.
 */
export function composePackageTestReporters({
  arguments: originalArguments = [], nodeOptions = "", additionalReporters = [], defaultReporter = "tap",
} = {}) {
  if (!Array.isArray(originalArguments) || originalArguments.some(value => typeof value !== "string" || value.includes("\0"))) {
    throw new TypeError("Node arguments must be an array of strings without NUL characters");
  }
  if (typeof nodeOptions !== "string" || nodeOptions.includes("\0")) throw new TypeError("NODE_OPTIONS must be a string without NUL characters");
  if (!nonemptyString(defaultReporter)) throw new TypeError("defaultReporter must be a nonempty string without NUL characters");
  if (!Array.isArray(additionalReporters) || additionalReporters.some(item =>
    !item || !nonemptyString(item.reporter) || !nonemptyString(item.destination))) {
    throw new TypeError("Each additional reporter must name its reporter and destination");
  }
  const inherited = reporterCounts(environmentArguments(nodeOptions));
  const command = reporterCounts(originalArguments);
  const reporters = inherited.reporters + command.reporters;
  const destinations = inherited.destinations + command.destinations;
  const appendedArguments = [];
  if (reporters === 0 && destinations === 0) {
    appendedArguments.push(`--test-reporter=${defaultReporter}`, "--test-reporter-destination=stdout");
  } else if (reporters === 1 && destinations === 0) {
    appendedArguments.push("--test-reporter-destination=stdout");
  } else if (reporters !== destinations) {
    throw new TypeError(`Original Node test reporter configuration has ${reporters} reporters and ${destinations} destinations; counts must match except for one reporter's implicit stdout`);
  }
  for (const { reporter, destination } of additionalReporters) {
    appendedArguments.push(`--test-reporter=${reporter}`, `--test-reporter-destination=${destination}`);
  }
  return Object.freeze({
    arguments: Object.freeze([...originalArguments, ...appendedArguments]),
    appendedArguments: Object.freeze(appendedArguments),
  });
}
