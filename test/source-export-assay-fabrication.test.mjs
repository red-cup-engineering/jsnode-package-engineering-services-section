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
  return spawnSync(process.execPath,args,{cwd,encoding:"utf8",timeout:15000,env});
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
