import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventParser, buildInvocation, composePrompt, runCli, cliError, CLI_PROVIDERS } from '../server/cli.js';
import { fileURLToPath } from 'node:url';
const fixture=fileURLToPath(new URL('./fixtures/cli.mjs',import.meta.url));
test('Codex forwards answer blocks, never reasoning or command output',()=>{
  const parse=createEventParser('codex');
  assert.equal(parse({type:'item.completed',item:{type:'reasoning',text:'secret'}}),'');
  assert.equal(parse({type:'item.completed',item:{type:'command_execution',aggregated_output:'secret'}}),'');
  assert.equal(parse({type:'item.completed',item:{type:'agent_message',text:'answer'}}),'answer');
});
test('Claude partial text is not duplicated by final assistant and result events',()=>{
  const parse=createEventParser('claude');
  assert.equal(parse({type:'stream_event',event:{type:'content_block_delta',delta:{type:'thinking_delta',thinking:'private'}}}),'');
  assert.equal(parse({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'hola'}}}),'hola');
  assert.equal(parse({type:'assistant',message:{content:[{type:'text',text:'hola'}]}}),'');
  assert.equal(parse({type:'result',result:'hola',is_error:false}),'');
});
test('OpenCode handles cumulative text without duplication',()=>{
  const parse=createEventParser('opencode');
  assert.equal(parse({type:'text',part:{id:'a',text:'hello'}}),'hello');
  assert.equal(parse({type:'text',part:{id:'a',text:'hello world'}}),' world');
  assert.equal(parse({type:'text',part:{id:'a',text:'hello world'}}),'');
});
test('provider errors become actionable messages without exposing raw output',()=>{
  const parse=createEventParser('claude');assert.throws(()=>parse({type:'result',is_error:true,result:'401 auth token sk-secret'}),e=>/authentication/.test(e.message)&&!e.message.includes('sk-secret'));
});
test('OpenCode does not require CLI login and distinguishes free-tier restrictions',()=>{
  assert.equal(CLI_PROVIDERS.opencode.loginCommand,null);
  const message=cliError('opencode',JSON.stringify({name:'Unauthorized',data:{message:"OpenCode's free tier can only be used from within OpenCode. Download it at https://opencode.ai and keep building."}}));
  assert.match(message,/free OpenCode model/);assert.match(message,/CLI_OPENCODE_MODEL/);assert.doesNotMatch(message,/auth login|requires authentication/);
  assert.match(cliError('opencode','401 Unauthorized'),/provider configured/);
  assert.match(cliError('opencode','unknown model'),/model and provider/);
});
test('invocations separate arguments, restrict tools and avoid shell bypass flags',()=>{
  const codex=buildInvocation('codex',{workdir:'/tmp'});assert.ok(codex.includes('sandbox_mode="read-only"'));assert.ok(codex.includes('app-server'));
  const claude=buildInvocation('claude',{workdir:'/tmp'});assert.equal(claude[claude.indexOf('--tools')+1],'');
  const opencode=buildInvocation('opencode',{workdir:'/tmp',port:12345});assert.ok(opencode.includes('serve'));assert.ok(opencode.includes('127.0.0.1'));assert.ok(opencode.includes('12345'));
  assert.ok(!opencode.includes('--agent'));assert.ok(!opencode.includes('--auto'));
  for(const args of [codex,claude,opencode])assert.ok(!args.some(a=>a.includes('dangerously')));
  assert.match(composePrompt('system',[{role:'user',content:'$(echo injected)'}]),/\$\(echo injected\)/);
});
test('all adapters execute fixture processes with real pipes',async()=>{
  for(const id of ['codex','claude','opencode']){
    let answer='';for await(const part of runCli({id,prompt:'fixture input',env:{...process.env,[`CLI_${id.toUpperCase()}_PATH`]:fixture},signal:AbortSignal.timeout(5000)}))answer+=part;
    assert.equal(answer,'Una respuesta con source [1].');
  }
});
test('empty replies and failed authentication cannot appear as successful answers',async()=>{
  for(const prompt of ['EMPTY_RESPONSE','FAIL_AUTH'])await assert.rejects(async()=>{for await(const _ of runCli({id:'codex',prompt,env:{...process.env,CLI_CODEX_PATH:fixture},signal:AbortSignal.timeout(5000)})){}},prompt==='FAIL_AUTH'?/authentication/:/could not complete/);
});
