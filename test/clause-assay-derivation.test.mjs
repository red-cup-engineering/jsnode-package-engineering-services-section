import assert from 'node:assert/strict';
import {admitClauseAssayDerivation} from '../src/fabrication-receipts.mjs';
import {assayCasesOfDelivery, deriveJsnodePackageFromClosure, testsOfClosure} from '../src/derive-jsnode-package-from-closure.mjs';
import { controlledLocalAssayFixture } from './fixtures/controlled-local-assay.mjs';
const closure={packageName:'fixture',packageVersion:'0.0.0',license:'MIT',dependencies:{},constraints:[],requirements:[{id:'successor',statement:'Return n plus one.'}],prohibitions:[{id:'negative',statement:'Refuse negative n with RangeError.'}],operations:[{name:'successor',module:'src/successor.mjs',exportName:'successor',description:'Return successor of nonnegative n.',inputSchema:{type:'object',required:['n'],properties:{n:{type:'integer'}},additionalProperties:false},outputSchema:{type:'integer',minimum:1}}],examples:[{name:'zero',operation:'successor',input:{n:0},output:1}]};
const cases=[{operation:'successor',name:'hidden-case-two',clauses:['successor'],input:{n:2},output:3,throws:null},{operation:'successor',name:'negative',clauses:['negative'],input:{n:-1},output:null,throws:'RangeError'}];
async function run(source,assays=cases){let calls=[];const result=await deriveJsnodePackageFromClosure(closure,{infer:async request=>{calls.push(request);return {text:JSON.stringify(calls.length===1?{cases:assays,question:null}:{source,question:null})};},isolatedAssayExecutor:controlledLocalAssayFixture});return {result,calls};}
const bad=await run('export function successor(){return 1;}');
assert.equal(bad.result.code,'DERIVATION_REJECTED');
assert.equal(bad.calls[0].taskClass,'code-fabrication-assays');
assert.equal(bad.calls.length,2);
assert.ok(!JSON.stringify(bad.calls[1].messages).includes('hidden-case-two'));
const good=await run('export function successor({n}){if(n<0)throw new RangeError();return n+1;}');
assert.equal(good.result.sources.length,1);
assert.ok(good.result.tests[0].text.includes('hidden-case-two'));
const missing=await run('unused',cases.slice(0,1));
assert.equal(missing.result.code,'ASSAY_DERIVATION_REFUSED');
assert.equal(missing.calls.length,1);
console.log(JSON.stringify({exampleOnlyCandidateRejected:true,validCandidatePassed:true,sourceBlindToDerivedCases:true,uncoveredProhibitionStopsBeforeSource:true,externalInferenceCalls:0,fixtureOnly:true}));

const order={projections:[{configuration:{...closure, sources:[],tests:[]}}],requirements:closure.requirements,prohibitions:closure.prohibitions,constraints:closure.constraints};
const derivation={attempts:good.result.derivations};
const binding=admitClauseAssayDerivation(order,{tests:good.result.tests},derivation);
assert.deepEqual(binding.tests,good.result.tests);
assert.throws(()=>admitClauseAssayDerivation(order,{tests:[]},derivation),{code:'CLAUSE_ASSAY_TEST_BINDING_MISMATCH'});
assert.throws(()=>admitClauseAssayDerivation(order,{tests:good.result.tests},{attempts:[...good.result.derivations].reverse()}),{code:'MISSING_PRIOR_CLAUSE_ASSAYS'});
assert.throws(()=>admitClauseAssayDerivation(order,{tests:good.result.tests},{attempts:[{...good.result.derivations[0],cases:cases.slice(0,1)}]}),{code:'INVALID_CLAUSE_ASSAYS'});
console.log(JSON.stringify({receiptReconstructsTests:true,droppedTestsRefused:true,assaysAfterSourceRefused:true,uncoveredClauseReceiptRefused:true,fixtureOnly:true}));


// Regression for Code Engineering's original P0 #74: an array-only
// operation must be able to test an invalid non-array value. The original
// input schema, not the carrier schema or a model's claim, decides whether
// the negative case really is outside the domain. This fixture is NOT a
// production isolated-host or downstream consumer acceptance receipt.
const arrayClosure = {
  packageName: 'array-clause-assay-fixture', packageVersion: '0.0.0', license: 'MIT',
  dependencies: {}, constraints: [],
  requirements: [{id:'sum-value', statement:'Sum the integer array.'}],
  prohibitions: [{id:'non-array', statement:'Reject non-array input with TypeError.'}],
  operations: [{
    name:'sum-list', module:'src/sum-list.mjs', exportName:'sumList',
    description:'Sum an array of integers without accepting scalar input.',
    inputSchema: {type:'array', items:{type:'integer'}},
    outputSchema: {type:'integer'},
  }],
  examples: [{name:'small-array', operation:'sum-list', input:[2,3], output:5}],
};
const arrayCases = [
  {operation:'sum-list', name:'independent-array', clauses:['sum-value'],
    input:[8,13], output:21, throws:null},
  {operation:'sum-list', name:'reject-scalar', clauses:['non-array'],
    input:'not an array', inputDomain:'outside-schema', output:null, throws:'TypeError'},
];
const deliverArray = cases => JSON.stringify({cases,question:null});
const acceptedArray = assayCasesOfDelivery(deliverArray(arrayCases), arrayClosure);
assert.deepEqual(acceptedArray.cases, arrayCases);
const derivedArrayTests = testsOfClosure(arrayClosure, acceptedArray.cases);
assert.equal(derivedArrayTests.length, 1);
assert.match(derivedArrayTests[0].text, /reject-scalar/u);
assert.match(derivedArrayTests[0].text, /assert\.rejects/u);
for (const attempt of [
  arrayCases.map(({inputDomain, ...rest}) => rest),
  arrayCases.map(item => item.name === 'reject-scalar'
    ? {...item, inputDomain:'admitted'} : item),
  arrayCases.map(item => item.name === 'reject-scalar'
    ? {...item, inputDomain:'outside-schema', input:[1,2]} : item),
  arrayCases.map(item => item.name === 'reject-scalar'
    ? {...item, inputDomain:'outside-schema', throws:null, output:0} : item),
  arrayCases.map(item => item.name === 'reject-scalar'
    ? {...item, inputDomain:'unsupported'} : item),
]) {
  assert.throws(() => assayCasesOfDelivery(deliverArray(attempt), arrayClosure),
    'an invalid schema-negative assay must refuse before source generation');
}

async function deriveArray(source, cases=arrayCases) {
  let inferenceCalls=0;
  const result=await deriveJsnodePackageFromClosure(arrayClosure,{
    infer: async () => ({
      text: JSON.stringify(++inferenceCalls===1 ? {cases,question:null}
        : {source,question:null}),
    }),
    isolatedAssayExecutor:controlledLocalAssayFixture,
  });
  return {result,inferenceCalls};
}
const validArray = await deriveArray(
  'export function sumList(values){if(!Array.isArray(values))throw new TypeError("array required");return values.reduce((sum,n)=>sum+n,0);}'
);
assert.ok(Array.isArray(validArray.result.sources), JSON.stringify(validArray.result));
assert.equal(validArray.inferenceCalls,2);
assert.match(validArray.result.tests[0].text,/reject-scalar/u);
const falselyAcceptedArray = await deriveArray(
  'export function sumList(values){if(!Array.isArray(values))return 0;return values.reduce((sum,n)=>sum+n,0);}'
);
assert.equal(falselyAcceptedArray.result.type,'JsnodeClosureDerivationRefusal');
assert.equal(falselyAcceptedArray.result.code,'DERIVATION_REJECTED');
assert.equal(falselyAcceptedArray.inferenceCalls,2);
const misdeclaredArray = await deriveArray('unreachable',arrayCases.map(item =>
  item.name === 'reject-scalar' ? {...item,input:[1,2]} : item));
assert.equal(misdeclaredArray.result.code,'ASSAY_DERIVATION_REFUSED');
assert.equal(misdeclaredArray.inferenceCalls,1,
  'schema-negative case must be rejected before buying source inference');
console.log(JSON.stringify({
  schemaNegativeAssayReceived:true, validArrayCandidatePreAssayed:true,
  invalidArrayBehaviorRejected:true, mislabeledInputRefusedBeforeSource:true,
  externalInferenceCalls:0, controlledFixtureOnly:true,
}));
