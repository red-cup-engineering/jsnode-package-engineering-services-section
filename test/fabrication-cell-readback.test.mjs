import test from 'node:test';
import assert from 'node:assert/strict';
import { assayChannel } from '../src/assay-channels.mjs';
import {
  FABRICATION_CELL_ATTRIBUTE,
  fabricationReceiptCellProjectionSchema,
  readFabricationReceiptCellRows,
} from '../src/fabrication-receipts.mjs';

test('a retained fabrication cell round-trips through the declared schema and address owners', () => {
  const cell = {subject:'game',predicate:'restored',object:'game',for:[],against:[]};
  const row = {a:FABRICATION_CELL_ATTRIBUTE, e:'ni:///sha-256;SYO77uCHgVuy6qqs6eWDk1d_ByCU9lXsWGDGYEEu_8c', t:0, v:cell};
  assert.equal(fabricationReceiptCellProjectionSchema.properties.cells.items.$ref, 'https://schemas.561.group/signcell/cell.schema.json');
  assert.deepEqual(readFabricationReceiptCellRows([row, row]), [cell]);
  assert.throws(() => readFabricationReceiptCellRows([{...row, e:'wrong'}]), {code:'FABRICATION_CELL_ROW_MISMATCH'});
  const channel = assayChannel({method:'draw',carrier:'table',evidence:['restored',1]});
  assert.equal(channel.id, 'ni:///sha-256;3sE6G7rZJQ6xA-9c57rZp_C8hLbp3vV5t3Txw-uVfTs');
  assert.equal(channel.evidence, 'ni:///sha-256;pkNnO952E7-y-X3TwZ4STv6sEERVNkzWdj6HVb5ofwU');
});
