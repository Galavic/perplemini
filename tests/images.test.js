import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateImages} from '../server/images.js';

const png={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'};
test('accepts eight images and rejects a ninth',()=>{
  assert.equal(validateImages(Array(8).fill(png)).length,8);
  assert.throws(()=>validateImages(Array(9).fill(png)),/8 images/);
});
test('accepts the per-image limit and enforces the combined image budget',()=>{
  const bytes=Buffer.alloc(5*1024*1024);Buffer.from(png.data,'base64').copy(bytes);
  const large={mime:'image/png',data:bytes.toString('base64')};
  assert.equal(validateImages(Array(4).fill(large)).length,4);
  assert.throws(()=>validateImages(Array(5).fill(large)),/20 MB/);
});
