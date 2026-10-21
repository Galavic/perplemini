import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createResearchTracker,researchPrompt} from '../server/research.js';
import {buildInvocation,openCodeConfig} from '../server/cli.js';

test('native research permits web tools while writing disables search and leaves shell restricted',()=>{
  const codex=buildInvocation('codex',{research:true,workdir:'/tmp'});
  assert.ok(codex.includes('web_search="live"'));assert.ok(codex.includes('features.shell_tool=false'));
  assert.ok(buildInvocation('codex',{research:false,workdir:'/tmp'}).includes('web_search="disabled"'));
  const claude=buildInvocation('claude',{research:true,workdir:'/tmp'});
  assert.equal(claude[claude.indexOf('--tools')+1],'WebSearch,WebFetch');assert.ok(claude.includes('--allowedTools'));
  const config=openCodeConfig(2,true);
  assert.deepEqual(config.permissions,[{action:'*',resource:'*',effect:'ask'},{action:'websearch',resource:'*',effect:'allow'},{action:'webfetch',resource:'*',effect:'allow'}]);
  assert.equal(config.agents,undefined);
  assert.deepEqual(openCodeConfig(1,true),{permission:{'*':'ask',websearch:'allow',webfetch:'allow'}});
  assert.match(researchPrompt({deep:true}),/several complementary searches/);
  assert.match(researchPrompt({mode:'writing'}),/do not browse the web/);
});

test('search sources keep IDs, resolve native citations, and never emit private reasoning or shell output',()=>{
  const events=[],tracker=createResearchTracker('codex',event=>events.push(event));
  tracker.observe({type:'item.completed',item:{id:'s1',type:'web_search',action:{type:'search',query:'query chosen by AI'},results:[{url:'https://example.org',title:'Original source',snippet:'Evidence',ref_id:'turn0search0'},{url:'javascript:alert(1)',title:'Unsafe'}]}});
  tracker.observe({type:'item.completed',item:{id:'r1',type:'web_search',action:{type:'open_page',url:'https://example.org'},results:[]}});
  tracker.observe({type:'item.completed',item:{type:'reasoning',text:'PRIVATE_REASONING'}});
  tracker.observe({type:'item.completed',item:{type:'command_execution',aggregated_output:'SECRET_OUTPUT'}});
  const answer=tracker.finish('A fact. citeturn0search0');
  assert.equal(answer,'A fact. [Original source](<https://example.org/>)');
  const sources=events.filter(event=>event.type==='sources').at(-1).sources;
  assert.equal(sources.length,1);assert.equal(sources[0].id,1);assert.equal(sources[0].kind,'cited');
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_REASONING|SECRET_OUTPUT|javascript:/);
});

test('no web activity means no invented sources or searches for a direct answer',()=>{
  const events=[],tracker=createResearchTracker('opencode',event=>events.push(event));
  assert.equal(tracker.finish('Hola. [An unverified link](https://example.com)'),'Hola. [An unverified link](https://example.com)');
  assert.equal(events.some(event=>event.type==='sources'),false);
  assert.deepEqual(events.at(-1),{type:'research',steps:[],searched:false,opened:false,completed:true});
});

test('failed fetches do not create sources; successful page reads omit navigation links',()=>{
  const events=[],tracker=createResearchTracker('opencode',event=>events.push(event));
  tracker.observe({type:'tool_use',part:{id:'failed',type:'tool',tool:'webfetch',state:{status:'error',input:{url:'https://failed.example'},output:'[Invented](https://invented.example)'}}});
  tracker.observe({type:'tool_use',part:{id:'read',type:'tool',tool:'webfetch',state:{status:'completed',input:{url:'https://example.org/document'},output:'[Navigation](https://example.org/contact)'}}});
  tracker.finish('An answer.');
  assert.deepEqual(events.filter(event=>event.type==='sources').at(-1).sources.map(source=>source.url),['https://example.org/document']);
});
