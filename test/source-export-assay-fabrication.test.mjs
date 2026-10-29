import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";
import {projectJsnodeExampleTests} from "../src/project-jsnode-example-tests.mjs";

const caseSource = operation => ({
  name: "reserved-name",
  module: "src/operation.mjs",
  exportName: operation,
});
const examples = [{name:"twice two",operation:"reserved-name",input:2,output:4}];
const derived = [
  {name:"negative refuses",operation:"reserved-name",input:-1,output:null,throws:"RangeError"},
  {name:"zero stays zero",operation:"reserved-name",input:0,output:0,throws:null},
];
const implementation = (exportName,wrong=false) => [
  wrong
    ? 'function implementation(value) { return 0; }'
    : 'function implementation(value) { if (value < 0) throw new RangeError("nonnegative required"); return value * 2; }',
  `export { implementation as ${JSON.stringify(exportName)} };`,
  "",
].join("\n");

function runNode(args,cwd) {
  // Node's parent test worker sets NODE_TEST_CONTEXT=child-v8. If inherited
  // by a nested node --test runner, Node skips the entire nested suite and
  // exits 0: a dangerously false behavioral success. Remove only that
  // worker-local marker; preserve the caller's remaining native environment.
  const env={...process.env};
  delete env.NODE_TEST_CONTEXT;
  // Node 24 defaults to the human-readable spec reporter, while earlier
  // native runners default to TAP. Select TAP explicitly for machine-read
  // assertions about executed/failed cases, never infer a passing result
  // merely from a child's zero exit code.
  const nativeArgs=args.includes("--test") ? ["--test-reporter=tap",...args] : args;
  return spawnSync(process.execPath,nativeArgs,{cwd,encoding:"utf8",timeout:15000,env});
}

test("native Node executes tests fabricated from legal ESM reserved, default, and ordinary named exports",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"original-jsnode-exports-"));
  try {
    await mkdir(path.join(directory,"src"));
    await mkdir(path.join(directory,"test"));
    for(const exportName of ["doubleValue","class","default","await"]){
      const operation=caseSource(exportName);
      const generated=projectJsnodeExampleTests(operation,examples,derived);
      assert.equal(generated.type,"JavascriptNodeOperationTestSource");
      assert.equal(generated.path,"test/reserved-name-examples.test.mjs");
      assert.match(generated.text,/import \{ "[^"]+" as fabricatedOperation \} from "\.\.\/src\/operation\.mjs";/);
      assert.doesNotMatch(generated.text,/import \{ class \}|import \{ default \}/);
      const sourcePath=path.join(directory,operation.module),testPath=path.join(directory,generated.path);
      await writeFile(sourcePath,implementation(exportName),"utf8");
      await writeFile(testPath,generated.text,"utf8");
      const syntax=runNode(["--check",testPath],directory);
      assert.equal(syntax.status,0,exportName+": "+syntax.stderr);
      const applied=runNode(["--test",testPath],directory);
      assert.equal(applied.status,0,exportName+": "+applied.stderr+"\n"+applied.stdout);
      assert.match(applied.stdout,/# pass 3\b/);
      assert.match(applied.stdout,/# fail 0\b/);
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("generated tests expose actual implementation disagreements, including negative requirements",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"original-jsnode-assay-refusal-"));
  try {
    await mkdir(path.join(directory,"src"));
    await mkdir(path.join(directory,"test"));
    const op=caseSource("class");
    const assay=projectJsnodeExampleTests(op,examples,derived);
    await writeFile(path.join(directory,op.module),implementation(op.exportName,true),"utf8");
    const testFile=path.join(directory,assay.path);
    await writeFile(testFile,assay.text,"utf8");
    const outcome=runNode(["--test",testFile],directory);
    assert.notEqual(outcome.status,0,"a wrong source may not pass the generated assays");
    assert.match(outcome.stdout,/# fail [1-9]/);
    assert.match(outcome.stdout,/twice two/);
    assert.match(outcome.stdout,/negative refuses/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("source-owned test projection preserves original clauses and cannot be influenced by locale or interpolation",()=>{
  const op=caseSource("default");
  const input=structuredClone(examples),cases=structuredClone(derived);
  const first=projectJsnodeExampleTests(op,examples,derived);
  for(let i=0;i<8;i++) assert.deepEqual(projectJsnodeExampleTests(op,examples,derived),first);
  assert.deepEqual(examples,input);
  assert.deepEqual(derived,cases);
  assert.deepEqual([...first.text.matchAll(/test\("/g)].length,3);
  assert.ok(Object.isFrozen(first));
  assert.match(first.text,/assert\.rejects/);
  assert.match(first.text,/RangeError/);
});


test("source-generated clause checks detect mutation and unstable replay rather than only matching the first output",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"jsnode-behavioral-clause-"));
  try {
    await mkdir(path.join(directory,"src"));
    await mkdir(path.join(directory,"test"));
    const op=caseSource("class");
    const withChecks=[{
      name:"preserve and repeat",operation:op.name,input:[4,1,3],output:[1,3,4],
      throws:null,checks:{inputUnchanged:true,stableReplay:true},
    }];
    const withoutChecks=withChecks.map(({checks,...caseData})=>caseData);
    const guarded=projectJsnodeExampleTests(op,[],withChecks);
    const legacy=projectJsnodeExampleTests(op,[],withoutChecks);
    assert.match(guarded.text,/assert\.deepStrictEqual\(assayInput, originalInput\)/u);
    assert.match(guarded.text,/assert\.deepStrictEqual\(replayOutput, firstOutput\)/u);
    assert.doesNotMatch(legacy.text,/replayOutput|originalInput/u);
    const sourceFile=path.join(directory,op.module);
    const testFile=path.join(directory,guarded.path);
    const sources={
      lawful:'function implementation(values){return [...values].sort((a,b)=>a-b);} export {implementation as "class"};',
      mutates:'function implementation(values){return values.sort((a,b)=>a-b);} export {implementation as "class"};',
      unstable:'let count=0; function implementation(values){const sorted=[...values].sort((a,b)=>a-b);return ++count % 2 ? sorted : sorted.reverse();} export {implementation as "class"};',
    };
    for (const [name,source] of Object.entries(sources)){
      await writeFile(sourceFile,source,"utf8");
      const syntax=runNode(["--check",sourceFile],directory);
      assert.equal(syntax.status,0,name+": "+syntax.stderr);
      await writeFile(testFile,guarded.text,"utf8");
      const guardedRun=runNode(["--test",testFile],directory);
      assert.equal(guardedRun.status===0,name==="lawful",
        name+" did not satisfy its expected independent behavior checks:\n"+guardedRun.stdout);
      assert.match(guardedRun.stdout,name==="lawful"?/# pass 1\b/u:/# fail 1\b/u);
      if(name!=="lawful"){
        await writeFile(testFile,legacy.text,"utf8");
        const uncheckedRun=runNode(["--test",testFile],directory);
        assert.equal(uncheckedRun.status,0,
          name+" must demonstrate that output-only testing missed this defect:\n"+uncheckedRun.stdout);
      }
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});


test("generated JSNode example tests reject code that drops an admitted JSON own key", async () => {
  const directory=await mkdtemp(path.join(tmpdir(),"jsnode-json-assay-identity-"));
  try {
    await mkdir(path.join(directory,"src"));
    await mkdir(path.join(directory,"test"));
    const original=JSON.parse('{"__proto__":{"marker":7},"n":1}');
    assert.equal(Object.hasOwn(original,"__proto__"),true);
    const operation=caseSource("class");
    const generated=projectJsnodeExampleTests(operation,[
      {name:"retain original own keys",operation:operation.name,input:original,output:original},
    ]);
    const sourceFile=path.join(directory,operation.module);
    const testFile=path.join(directory,generated.path);
    await writeFile(testFile,generated.text,"utf8");

    // A generated oracle must reject an implementation that preserves only
    // the ordinary property while discarding the original own "__proto__".
    await writeFile(sourceFile,[
      'function implementation(value) { return {n:value.n}; }',
      'export { implementation as "class" };',
    ].join("\n"),"utf8");
    const wrong=runNode(["--test",testFile],directory);
    assert.notEqual(wrong.status,0,
      "the original generated test must reject an implementation missing a JSON own property:\n"+wrong.stdout);
    assert.match(wrong.stdout,/# fail 1\b/u);

    // The same source-derived test still admits the correct JSON-preserving
    // implementation and its exact expected value.
    await writeFile(sourceFile,[
      'function implementation(value) { return structuredClone(value); }',
      'export { implementation as "class" };',
    ].join("\n"),"utf8");
    const correct=runNode(["--test",testFile],directory);
    assert.equal(correct.status,0,correct.stderr+"\n"+correct.stdout);
    assert.match(correct.stdout,/# pass 1\b/u);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("source-derived positive, negative, replay and scalar assays retain exact JSON values",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"jsnode-json-assay-clauses-"));
  try {
    await mkdir(path.join(directory,"src"));
    await mkdir(path.join(directory,"test"));
    const operation=caseSource("class");
    const original=JSON.parse('{"__proto__":{"outer":7},"nested":[{"__proto__":{"inner":9},"n":2}]}');
    const invalid=JSON.parse('{"__proto__":{"deny":true},"deny":true}');
    assert.equal(Object.hasOwn(original.nested[0],"__proto__"),true);
    const cases=[
      {name:"complete replay",operation:operation.name,input:original,output:original,
        throws:null,checks:{inputUnchanged:true,stableReplay:true}},
      {name:"reject forbidden own key",operation:operation.name,input:invalid,output:null,
        throws:"TypeError"},
      {name:"ordinary scalar",operation:operation.name,input:4,output:4,throws:null},
    ];
    const generated=projectJsnodeExampleTests(operation,[],cases);
    assert.match(generated.text,/JSON\.parse\(/u);
    const sourceFile=path.join(directory,operation.module);
    const testFile=path.join(directory,generated.path);
    await writeFile(sourceFile,[
      'function implementation(value) {',
      '  if (value !== null && typeof value === "object" && value.deny && Object.hasOwn(value,"__proto__")) throw new TypeError("forbidden");',
      '  return structuredClone(value);',
      '}',
      'export { implementation as "class" };',
    ].join("\n"),"utf8");
    await writeFile(testFile,generated.text,"utf8");
    const syntax=runNode(["--check",testFile],directory);
    assert.equal(syntax.status,0,syntax.stderr);
    const executed=runNode(["--test",testFile],directory);
    assert.equal(executed.status,0,executed.stderr+"\n"+executed.stdout);
    assert.match(executed.stdout,/# pass 3\b/u);
    assert.match(executed.stdout,/# fail 0\b/u);
    assert.equal(Object.hasOwn(original,"__proto__"),true);
    assert.equal(Object.hasOwn(invalid,"__proto__"),true);
  } finally {await rm(directory,{recursive:true,force:true});}
});


test("ordinary admitted JSON assays retain their original historical test-source form",()=>{
  const operation=caseSource("default");
  const original=projectJsnodeExampleTests(operation,examples,derived);
  assert.doesNotMatch(original.text,/JSON\.parse\(/u,
    "unaffected source/assay receipts must not be rewritten by a fix for a distinct JSON key");
  assert.match(original.text,/fabricatedOperation\(2\), 4/u);
  assert.match(original.text,/fabricatedOperation\(-1\)/u);

  // A string VALUE containing key-looking text is not an object member.
  const textValue={text:'"__proto__":',n:2};
  const quoted=projectJsnodeExampleTests(operation,[
    {name:"quoted property spelling",input:textValue,output:textValue},
  ]);
  assert.doesNotMatch(quoted.text,/JSON\.parse\(/u);
  assert.deepEqual(textValue,{text:'"__proto__":',n:2});
});
