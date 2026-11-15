import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNodeWithTestObservation } from './fixtures/native-node-observation.mjs';

const syntax = fileURLToPath(new URL('../scripts/check-package-syntax.mjs', import.meta.url));
const runner = fileURLToPath(new URL('../scripts/run-package-tests.mjs', import.meta.url));
const complete = 'TAP version 13\n# Subtest: admitted\nok 1 - admitted\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n';

function fixture(t, {hasTest = true} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'native-check-receiving-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeFileSync(join(root, 'package.json'), JSON.stringify({name: '@fixture/receiving', type: 'module'}));
  if (hasTest) {
    mkdirSync(join(root, 'test'));
    writeFileSync(join(root, 'test', 'actual.test.mjs'), 'import test from "node:test"; test("admitted",()=>{});\n');
  }
  const hook = join(root, 'spawn-observation.mjs');
  writeFileSync(hook, `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { writeFileSync } from 'node:fs';
const original = childProcess.spawnSync;
const supplied = JSON.parse(process.env.NATIVE_CHECK_OBSERVATION);
childProcess.spawnSync = function(command, args, options) {
  if (command !== process.execPath || (!args.includes('--test') && !args.includes('--check'))) return original(command, args, options);
  const destination = args.filter(value => value.startsWith('--test-reporter-destination=') && value !== '--test-reporter-destination=stdout').at(-1);
  if (destination && supplied.report !== null) writeFileSync(destination.split('=').slice(1).join('='), supplied.report);
  return {status:supplied.status, signal:supplied.signal ?? null, stdout:'', stderr:'',
    ...(supplied.errorCode ? {error:Object.assign(new Error('fixture launch refused'),{code:supplied.errorCode})} : {})};
};
syncBuiltinESMExports();
`);
  return {root, hook};
}

function observe(t, target, observation, options) {
  const {root, hook} = fixture(t, options);
  const {NODE_TEST_CONTEXT, ...environment} = process.env;
  const result = spawnSync(process.execPath, ['--import', hook, target], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: {...environment, PACKAGE_TEST_DIRECTORY: root, NATIVE_CHECK_OBSERVATION: JSON.stringify(observation)},
  });
  assert.equal(result.error, undefined, 'the independent fixture itself must really execute');
  return result;
}
const reportOf = result => JSON.parse(result.stdout.trim().split('\n').at(-1));

test('syntax receiving refuses a launch error even when its status is zero', t => {
  const result = observe(t, syntax, {status: 0, errorCode: 'EPERM', report: complete});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPERM|launch refused/i);
  assert.doesNotMatch(result.stdout, /2\/2 files parse/);
});

test('syntax receiving preserves successful parsing and refuses terminating signals', t => {
  assert.equal(observe(t, syntax, {status: 0, report: complete}).status, 0);
  for (const observation of [{status: null, signal: 'SIGTERM', report: null}, {status: 0, signal: 'SIGTERM', report: null}]) {
    assert.notEqual(observe(t, syntax, observation).status, 0);
  }
});

test('test receiving refuses process errors and signals despite a plausible complete report', t => {
  for (const observation of [
    {status: 0, errorCode: 'EPERM', report: complete},
    {status: 0, errorCode: 'ENOBUFS', report: complete},
    {status: null, signal: 'SIGTERM', report: complete},
    {status: 0, signal: 'SIGTERM', report: complete},
  ]) {
    const result = observe(t, runner, observation);
    assert.notEqual(result.status, 0);
    assert.equal(reportOf(result).ok, false);
  }
});

test('test receiving cannot turn missing, partial or inconsistent TAP into zero failures', t => {
  for (const report of [
    null, '', 'TAP version 13\n',
    complete.slice(0, complete.indexOf('# cancelled')),
    complete.replace('1..1\n', ''),
    complete.replace('ok 1 - admitted\n', ''),
    complete.replace('# tests 1', '# tests 2'),
    complete.replace('# pass 1', '# pass 0'),
    complete + '# pass 1\n',
    complete + '1..1\n',
  ]) {
    const result = observe(t, runner, {status: 0, report});
    assert.notEqual(result.status, 0, JSON.stringify(report));
    assert.equal(reportOf(result).ok, false);
  }
});

test('complete native success and an empty selected plan retain their successful meaning', t => {
  const result = observe(t, runner, {status: 0, report: complete});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Object.fromEntries(['ok','files','ran','passed','failed'].map(key => [key, reportOf(result)[key]])),
    {ok: true, files: 1, ran: 1, passed: 1, failed: 0});
  const empty = observe(t, runner, {status: 0, report: null}, {hasTest: false});
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(reportOf(empty).files, 0);
  assert.equal(reportOf(empty).ran, 0);
});

test('complete failed test output remains a failed test result', t => {
  const failed = complete.replace('ok 1 - admitted', 'not ok 1 - admitted').replace('# pass 1', '# pass 0').replace('# fail 0', '# fail 1');
  const result = observe(t, runner, {status: 1, report: failed});
  assert.notEqual(result.status, 0);
  assert.equal(reportOf(result).ok, false);
  assert.equal(reportOf(result).failed, 1);
});

test('actual nested Node suites with skips and TODOs retain native counts', t => {
  const {root} = fixture(t);
  writeFileSync(join(root,'test','actual.test.mjs'), `import {describe,it} from 'node:test';
describe('nested',()=>{it('pass',()=>{});it.skip('skip',()=>{});it.todo('later');});\n`);
  const native = runNodeWithTestObservation(['--test','test/actual.test.mjs'], root);
  assert.equal(native.error, undefined);
  assert.equal(native.status, 0, native.stderr);
  const result = observe(t, runner, {status: native.status, report: native.tap});
  assert.equal(result.status, 0, result.stderr);
  const receipt = reportOf(result);
  assert.equal(receipt.ran, 3);
  assert.equal(receipt.passed, 1);
  assert.equal(receipt.failed, 0);
});


test('actual mixed registered tests and a top-level assertion file retain native wrapper numbering', t => {
  const {root} = fixture(t);
  writeFileSync(join(root,'test','actual.test.mjs'), 'import test from "node:test"; test("first",()=>{}); test("second",()=>{}); test("third",()=>{});\n');
  writeFileSync(join(root,'test','wrapper.test.mjs'), 'import assert from "node:assert/strict"; assert.equal(6*7,42);\n');
  const {NODE_TEST_CONTEXT, ...environment} = process.env;
  const result = spawnSync(process.execPath, [runner], {cwd: root, encoding: 'utf8', timeout: 15000,
    env: {...environment, PACKAGE_TEST_DIRECTORY: root}});
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(reportOf(result).ok, true);
  assert.equal(reportOf(result).files, 2);
  assert.equal(reportOf(result).ran, 4);
  assert.equal(reportOf(result).passed, 4);
});

test('receiving reports a partially runnable plan as incomplete, without losing native counts', t => {
  const {root} = fixture(t);
  const enrolled = ['test/actual.test.mjs', 'test/conditional.test.mjs'];
  const requirement = 'JSNODE_FIXTURE_PERMIT_RECEIVING';
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: '@fixture/receiving', type: 'module', receivingTests: enrolled,
    testRequires: {[enrolled[1]]: {env: requirement}},
  }));
  writeFileSync(join(root, enrolled[1]), 'import test from "node:test"; test("conditional",()=>{});\n');
  const {NODE_TEST_CONTEXT, [requirement]: ignored, ...environment} = process.env;
  const run = (flags, extra = {}) => {
    const result = spawnSync(process.execPath, [runner, ...flags], {cwd: root, encoding: 'utf8', timeout: 15000,
      env: {...environment, PACKAGE_TEST_DIRECTORY: root, ...extra}});
    assert.equal(result.error, undefined);
    return {result, report: reportOf(result)};
  };
  const incomplete = run(['--receiving']);
  assert.notEqual(incomplete.result.status, 0, incomplete.result.stdout);
  assert.deepEqual(incomplete.report.requires, [{test: enrolled[1], unmet: [{kind: 'env', value: requirement}]}]);
  assert.deepEqual(Object.fromEntries(['ok','profile','planned','files','ran','passed','failed'].map(key => [key,incomplete.report[key]])),
    {ok: false, profile: 'receiving', planned: 2, files: 1, ran: 1, passed: 1, failed: 0});
  assert.match(incomplete.report.error, /receiving test requirements are unmet/u);

  const source = run([]);
  assert.equal(source.result.status, 0, source.result.stderr);
  assert.equal(source.report.profile, 'source');
  assert.equal(source.report.files, 1);
  assert.equal(source.report.requires.length, 1);
  const complete = run(['--receiving'], {[requirement]: '1'});
  assert.equal(complete.result.status, 0, complete.result.stderr);
  assert.equal(complete.report.ok, true);
  assert.equal(complete.report.files, 2);
  assert.equal(complete.report.passed, 2);
});

test('receiving refuses native selection filters instead of certifying the passing subset', t => {
  const {root} = fixture(t);
  const file = 'test/actual.test.mjs';
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: '@fixture/receiving', type: 'module', receivingTests: [file],
  }));
  writeFileSync(join(root, file), 'import test from "node:test"; test("accepted",()=>{}); test("rejected",()=>{throw Error("not received")});\n');
  const {NODE_TEST_CONTEXT, NODE_OPTIONS, ...environment} = process.env;
  const run = (flags, nodeOptions = '') => {
    const result = spawnSync(process.execPath, [runner, ...flags], {cwd: root, encoding: 'utf8', timeout: 15000,
      env: {...environment, NODE_OPTIONS: nodeOptions, PACKAGE_TEST_DIRECTORY: root}});
    assert.equal(result.error, undefined);
    return {result, report: reportOf(result)};
  };
  assert.equal(run(['--test-name-pattern=accepted']).result.status, 0, 'source callers may run a deliberate subset');
  assert.equal(run(['--receiving']).report.failed, 1, 'full receiving must see the otherwise hidden failure');
  for (const [flags, inherited] of [
    [['--test-name-pattern=accepted'], ''],
    [['--test_skip_pattern', 'rejected'], ''],
    [[], '--test-name-pattern="accepted"'],
    [['--test-only'], ''],
    [['--test-shard=1/2'], ''],
    [['--test-rerun-failures=previous-run.json'], ''],
  ]) {
    const {result, report} = run(['--receiving', ...flags], inherited);
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.files, 0, 'refused filtering must not claim that test files were executed');
    assert.match(report.error, /receiving cannot use Node test selection option/u);
  }
});

test('native wrapper compatibility does not excuse duplicate ordinals without the actual enrolled identity', t => {
  for (const wrapper of ['test/not-enrolled.test.mjs', 'test/actual.test.mjs # SKIP fabricated']) {
    const report = 'TAP version 13\nok 1 - first\nok 1 - '+wrapper+'\n1..2\n# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n';
    const result = observe(t, runner, {status: 0, report});
    assert.notEqual(result.status, 0);
    assert.equal(reportOf(result).ok, false);
  }
});

test('exact generated cases are distinct from authored suite accounting', async t => {
  const { receivePackageTestReport } = await import('../src/package-check-outcome.mjs');
  const {root} = fixture(t);
  const file = join(root, 'test', 'actual.test.mjs');
  const names = ['hash#case', 'path\\case', 'tab\tcase'];
  writeFileSync(file, 'import test from "node:test";\n' + names.map(name => `test(${JSON.stringify(name)},()=>{});`).join('\n'));
  const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
  const run = () => spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/actual.test.mjs'], {cwd:root, env, encoding:'utf8'});
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(receivePackageTestReport(result.stdout, {files:['test/actual.test.mjs'], expectedTestNames:names}).problem, null);
  assert.notEqual(receivePackageTestReport(result.stdout, {expectedTestNames:[...names, 'missing']}).problem, null);
  for (const source of [
    'process.exit(0);',
    'import test from "node:test"; test.skip("required",()=>{});',
    'import test from "node:test"; test.todo("required");',
    'import {describe,it} from "node:test"; describe("required",()=>it("child",()=>{}));',
  ]) {
    writeFileSync(file, source);
    result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(receivePackageTestReport(result.stdout, {files:['test/actual.test.mjs']}).problem, null);
    assert.notEqual(receivePackageTestReport(result.stdout, {files:['test/actual.test.mjs'], expectedTestNames:['required']}).problem, null);
  }
  writeFileSync(file, 'process.exit(0);');
  result = run();
  assert.notEqual(receivePackageTestReport(result.stdout, {files:['test/actual.test.mjs'], expectedTestNames:['test/actual.test.mjs']}).problem, null);
});
