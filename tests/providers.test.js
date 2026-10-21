import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSources, safeUrl } from '../server/providers.js';
test('sources reject executable URLs, deduplicate and retain stable citation numbers',()=>{
  const sources=normalizeSources([{url:'javascript:alert(1)',title:'Unsafe'},{url:'https://example.com',title:'One',content:'a'.repeat(7000)},{url:'https://example.com/',title:'Duplicate'},{url:'https://other.org',title:'Two'}]);
  assert.equal(sources.length,2);assert.deepEqual(sources.map(s=>s.id),[1,2]);assert.equal(sources[0].content.length,5000);assert.equal(safeUrl('data:text/html,hello'),null);
});
