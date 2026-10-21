import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {runCli} from '../server/cli.js';
import {readSse,codexStreamArgs} from '../server/streaming.js';

const fixture=fileURLToPath(new URL('./fixtures/cli.mjs',import.meta.url));
for(const id of ['codex','claude','opencode']){
  test(`${id} yields partial text before completion without repeating the final snapshot`,async()=>{
    const iterator=runCli({id,prompt:'SLOW_STREAM',signal:AbortSignal.timeout(8000),env:{...process.env,[`CLI_${id.toUpperCase()}_PATH`]:fixture}});
    try{
      const first=await iterator.next();assert.equal(first.value,'Primera parte ');assert.equal(first.done,false);
      let resolved=false;
      const next=iterator.next().then(value=>{resolved=true;return value;});
      await delay(80);assert.equal(resolved,false,'a second fragment should still be generating after the first is visible');
      assert.equal((await next).value,'segunda parte');
      assert.equal((await iterator.next()).done,true);
    }finally{await iterator.return();}
  });
}

test('SSE decoder preserves Unicode and split multiline frames, ignoring keepalive comments',async()=>{
  const encoded=Buffer.from(': connected\r\n\r\ndata: {"text":\r\ndata: "¡Hola! 👋"}\r\n\r\n');
  const chunks=[];for(let i=0;i<encoded.length;i+=2)chunks.push(encoded.subarray(i,i+2));
  const result=[];for await(const event of readSse(Readable.from(chunks)))result.push(event);
  assert.deepEqual(result,[{text:'¡Hola! 👋'}]);
});

test('Codex streaming uses the CLI app-server with shell, hooks and extra agents disabled',()=>{
  const args=codexStreamArgs(true);
  assert.equal(args[0],'app-server');assert.ok(args.includes('stdio://'));
  for(const setting of ['features.shell_tool=false','features.hooks=false','features.multi_agent=false','sandbox_mode="read-only"','approval_policy="never"','web_search="live"'])assert.ok(args.includes(setting));
  assert.ok(!args.some(arg=>arg.includes('dangerously')));
});
