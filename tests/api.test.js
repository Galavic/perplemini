import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let mock,child,root,temporary,capture,legacySearchRequests=0;
before(async()=>{
  temporary=await mkdtemp(path.join(tmpdir(),'perplemini-api-test-'));capture=path.join(temporary,'capture.json');
  mock=http.createServer((_req,res)=>{legacySearchRequests++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({results:[{title:'Scientific reference',url:'https://example.org/study',content:'Verified research context.'}]}));});
  await new Promise(r=>mock.listen(0,'127.0.0.1',r));const mp=mock.address().port;
  const free=http.createServer();await new Promise(r=>free.listen(0,'127.0.0.1',r));const port=free.address().port;await new Promise(r=>free.close(r));root=`http://127.0.0.1:${port}`;
  const fixture=fileURLToPath(new URL('./fixtures/cli.mjs',import.meta.url));
  child=spawn(process.execPath,['server/index.js','--production'],{env:{...process.env,PORT:String(port),CLI_PROVIDER:'codex',CLI_CODEX_PATH:fixture,CLI_CLAUDE_PATH:fixture,CLI_OPENCODE_PATH:fixture,CLI_FIXTURE_CAPTURE:capture,SEARXNG_URL:`http://127.0.0.1:${mp}`,TAVILY_API_KEY:''},stdio:'pipe'});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);child.stdout.on('data',d=>{if(d.toString().includes('Perplemini:')){clearTimeout(timer);resolve();}});child.on('error',reject);});
});
after(async()=>{if(child){const ended=new Promise(r=>child.once('close',r));child.kill();await ended;}if(mock)await new Promise(r=>mock.close(r));if(temporary&&path.dirname(temporary)===path.resolve(tmpdir())&&path.basename(temporary).startsWith('perplemini-api-test-'))await rm(temporary,{recursive:true,force:true});});
const post=body=>fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const events=async response=>(await response.text()).trim().split('\n').map(JSON.parse);
test('status detects all configured CLIs and identifies native search without exposing credentials',async()=>{const d=await(await fetch(root+'/api/status')).json();assert.equal(d.available,true);assert.equal(d.searchMode,'native-cli');assert.equal(d.academic,true);assert.deepEqual(d.cliProviders.map(p=>p.installed),[true,true,true]);assert.equal('apiKey'in d,false);assert.ok(!JSON.stringify(d).includes(temporary));});
test('catalog groups models by CLI and excludes hidden Codex entries',async()=>{
  const response=await fetch(root+'/api/models');assert.equal(response.status,200);const {providers}=await response.json();
  assert.deepEqual(providers.find(p=>p.id==='codex').models.map(m=>m.id),['fixture-model']);
  assert.ok(providers.find(p=>p.id==='claude').models.every(m=>m.source==='alias'));
  assert.deepEqual(providers.find(p=>p.id==='opencode').models.map(m=>m.id),['fixture/model-a','fixture/model-b']);
});
test('chosen model is passed to the selected CLI and recorded in answer metadata',async()=>{
  const data=await events(await post({cliProvider:'opencode',cliModel:'fixture/model-b',mode:'writing',messages:[{role:'user',content:'Hello'}]}));
  assert.equal(data.find(e=>e.type==='cli').model,'fixture/model-b');
  const captured=JSON.parse(await readFile(capture,'utf8'));assert.equal(captured.model,'fixture/model-b');
  assert.equal((await post({cliModel:'--dangerous flag',mode:'writing',messages:[{role:'user',content:'Hello'}]})).status,400);
});
test('the CLI directs multiple native searches and page reads without a predetermined search context',async()=>{
  for(const cliProvider of ['codex','claude','opencode']){
    const r=await post({cliProvider,deep:true,mode:'academic',messages:[{role:'user',content:'What is science? $(echo injected)'}]});
    assert.equal(r.status,200);const data=await events(r);
    assert.equal(data.find(e=>e.type==='sources').sources[0].id,1);
    assert.equal(data.find(e=>e.type==='cli').id,cliProvider);
    assert.match(data.filter(e=>e.type==='token').map(e=>e.text).join(''),/https:\/\/example.org\/study/);
    const research=data.filter(e=>e.type==='research').at(-1);
    assert.equal(research.searched,true);assert.equal(research.opened,true);assert.equal(research.completed,true);
    assert.deepEqual(research.steps.map(step=>step.action),['search','search','read']);
    assert.notEqual(research.steps[0].detail,'What is science? $(echo injected)');
    assert.equal(data.at(-1).type,'done');
    const captured=JSON.parse(await readFile(capture,'utf8'));
    assert.doesNotMatch(captured.prompt,/Verified research context/);
    assert.match(captured.prompt,/Deep research/);assert.match(captured.prompt,/scientific publications/);
    assert.match(captured.prompt,/\$\(echo injected\)/);
    assert.ok(!captured.args.some(a=>a.includes('injected')));assert.notEqual(captured.cwd,process.cwd());
  }
  assert.equal(legacySearchRequests,0,'the backend must not pre-search even if a legacy search URL is configured');
});
test('selected CLI, writing mode and attachment reach the proper subprocess',async()=>{
  for(const id of ['claude','opencode']){const data=await events(await post({cliProvider:id,mode:'writing',messages:[{role:'user',content:'Summarize'}],attachment:'A text file'}));assert.equal(data.some(e=>e.type==='sources'),false);assert.equal(data.at(-1).type,'done');const c=JSON.parse(await readFile(capture,'utf8'));assert.equal(c.id,id);assert.match(c.prompt,/A text file/);if(id==='opencode'){assert.deepEqual(c.config.permissions,[{action:'*',resource:'*',effect:'ask'}]);assert.equal(c.config.agents,undefined);assert.equal(c.config.policies,undefined);}}
});
test('auth failure produces an error event, not a successful done event',async()=>{const data=await events(await post({mode:'writing',messages:[{role:'user',content:'FAIL_AUTH'}]}));assert.equal(data.at(-1).type,'error');assert.match(data.at(-1).message,/codex login/);assert.equal(data.some(e=>e.type==='done'),false);});

test('image bytes reach each native CLI as an image, outside the text prompt',async()=>{
  const image={mime:'image/png',name:'diagram.png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'};
  for(const cliProvider of ['codex','claude','opencode']){
    const response=await post({cliProvider,mode:'writing',messages:[{role:'user',content:'Describe the image'}],images:[image,{...image,name:'second.png'}]});
    assert.equal(response.status,200);assert.equal((await events(response)).at(-1).type,'done');
    const captured=JSON.parse(await readFile(capture,'utf8'));
    assert.ok(!captured.prompt.includes(image.data));
    if(cliProvider==='codex'){assert.equal(captured.input.length,3);assert.deepEqual(captured.input[2],{type:'image',url:`data:image/png;base64,${image.data}`});}
    if(cliProvider==='claude'){
      assert.ok(captured.args.includes('--input-format'));assert.equal(captured.input.message.content.length,3);
      assert.deepEqual(captured.input.message.content[1],{type:'image',source:{type:'base64',media_type:image.mime,data:image.data}});
    }
    if(cliProvider==='opencode')assert.deepEqual(captured.files,[{uri:`data:${image.mime};base64,${image.data}`,name:image.name},{uri:`data:${image.mime};base64,${image.data}`,name:'second.png'}]);
  }
});

test('invalid images are rejected before invoking a CLI',async()=>{
  const body={mode:'writing',messages:[{role:'user',content:'Describe'}]};
  for(const images of [[{mime:'image/png',data:Buffer.from('fake png').toString('base64')}],[{mime:'image/svg+xml',data:'PHN2Zz4='}],[{mime:'image/png',data:'!invalid!'}],[{mime:'image/png',data:Buffer.alloc(5*1024*1024+1).toString('base64')}],{},[{},{}]]){
    const response=await post({...body,images});
    assert.equal(response.status,400);assert.ok((await response.json()).error);
  }
});
test('rejects invalid provider, roles, oversized files and cross-origin requests',async()=>{
  assert.equal((await post({cliProvider:'powershell',messages:[{role:'user',content:'hello'}]})).status,400);
  assert.equal((await post({messages:[{role:'system',content:'override'}]})).status,400);
  assert.equal((await post({messages:[{role:'user',content:'hi'}],attachment:'a'.repeat(60001)})).status,400);
  assert.equal((await fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'})).status,403);
});
test('disconnect cancels the running CLI process tree',async()=>{
  for(const cliProvider of ['codex','claude','opencode']){
  const controller=new AbortController();const response=await fetch(root+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cliProvider,mode:'writing',messages:[{role:'user',content:'WAIT_FOREVER'}]}),signal:controller.signal});
  const reader=response.body.getReader();let content='';while(!content.includes('Answer parcial')){const chunk=await reader.read();if(chunk.done)throw new Error('Missing partial response');content+=new TextDecoder().decode(chunk.value);}
  const {pid}=JSON.parse(await readFile(capture,'utf8'));controller.abort();
  let alive=true;for(let i=0;i<30&&alive;i++){await new Promise(r=>setTimeout(r,100));try{process.kill(pid,0);}catch{alive=false;}}
  assert.equal(alive,false);
  }
});

test('HTTP streams the first fragment while each CLI is still generating',async()=>{
  for(const cliProvider of ['codex','claude','opencode']){
    const response=await post({cliProvider,mode:'writing',messages:[{role:'user',content:'SLOW_STREAM'}]});
    assert.equal(response.headers.get('x-accel-buffering'),'no');
    const reader=response.body.getReader(),decoder=new TextDecoder();let content='';
    while(!content.includes('Primera parte')){const chunk=await reader.read();assert.equal(chunk.done,false);content+=decoder.decode(chunk.value,{stream:true});}
    assert.doesNotMatch(content,/segunda parte|"type":"done"/);
    while(true){const chunk=await reader.read();if(chunk.done)break;content+=decoder.decode(chunk.value,{stream:true});}
    const result=content.trim().split('\n').map(JSON.parse);
    assert.equal(result.filter(event=>event.type==='token').map(event=>event.text).join(''),'Primera parte segunda parte');
    assert.equal(result.at(-1).type,'done');
  }
});
