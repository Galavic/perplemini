import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validModel,normalizeModels} from '../server/models.js';
test('model names support provider IDs and variants while rejecting executable arguments',()=>{
  for(const id of ['','gpt-6.1-sol','sonnet','anthropic/claude-sonnet-5#high'])assert.equal(validModel(id),true);
  for(const id of [null,{},'--model','$(echo secret)','model with spaces','x'.repeat(201)])assert.equal(validModel(id),false);
});
test('model catalog deduplicates IDs and retains display names without accepting malformed entries',()=>{
  const result=normalizeModels([null,42,{model:'test-model',displayName:'Test model'},{id:'test-model'},'provider/model','--flag'],'cli');
  assert.deepEqual(result,[{id:'test-model',name:'Test model',source:'cli'},{id:'provider/model',name:'provider/model',source:'cli'}]);
});
