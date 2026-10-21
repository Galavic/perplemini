import { readFile, writeFile } from 'node:fs/promises';
import {codexFixture,openCodeFixture} from './native-servers.mjs';
const args=process.argv.slice(2);
if(args.includes('--version')){console.log('2.0.0-fixture');process.exit(0);}
if(args.includes('app-server')){
  codexFixture(args);
}else if(args[0]==='serve'){
  await openCodeFixture(args);
}else if(args[0]==='models'){
  console.log('fixture/model-a\nfixture/model-b');
}else{
const id=args.includes('exec')?'codex':args.includes('--print')?'claude':'opencode';
let prompt='';
if(id==='opencode')prompt=await readFile(args[args.indexOf('--file')+1],'utf8');
else for await(const chunk of process.stdin)prompt+=chunk;
let input;
if(args.includes('--input-format')){input=JSON.parse(prompt);prompt=input.message.content.filter(part=>part.type==='text').map(part=>part.text).join('\n');}
if(process.env.CLI_FIXTURE_CAPTURE)await writeFile(process.env.CLI_FIXTURE_CAPTURE,JSON.stringify({id,prompt,input,args,cwd:process.cwd(),pid:process.pid,...(id==='opencode'?{config:JSON.parse(await readFile('opencode.json','utf8'))}:{})}));
if(prompt.includes('FAIL_AUTH')){console.error('not logged in');process.exit(2);}
if(prompt.includes('EMPTY_RESPONSE'))process.exit(0);
const emit=event=>console.log(JSON.stringify(event));
const config=id==='opencode'?JSON.parse(await readFile('opencode.json','utf8')):null;
const research=args.includes('web_search="live"')||args.includes('WebSearch,WebFetch')||config?.permissions?.some(rule=>rule.action==='websearch'&&rule.effect==='allow');
if(research){
  const results=[{ref_id:'turn0search0',title:'Scientific reference',url:'https://example.org/study',snippet:'Verified research context.'}];
  const queries=['consulta específica elegida por la IA','contrastar la evidencia de la primera búsqueda'];
  for(const [index,query] of queries.entries()){
    if(id==='codex')emit({type:'item.completed',item:{id:`search-${index}`,type:'web_search',action:{type:'search',query},results}});
    if(id==='claude'){
      emit({type:'assistant',message:{content:[{type:'tool_use',id:`search-${index}`,name:'WebSearch',input:{query}}]}});
      emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:`search-${index}`,content:JSON.stringify({results})}]}});
    }
    if(id==='opencode')emit({type:'tool_use',part:{id:`search-${index}`,type:'tool',tool:'websearch',state:{status:'completed',input:{query},output:JSON.stringify({results})}}});
  }
  if(id==='codex')emit({type:'item.completed',item:{id:'read',type:'web_search',action:{type:'open_page',url:results[0].url},results}});
  if(id==='claude'){
    emit({type:'assistant',message:{content:[{type:'tool_use',id:'read',name:'WebFetch',input:{url:results[0].url,prompt:'Read the evidence'}}]}});
    emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:'read',content:'Verified research context.'}]}});
  }
  if(id==='opencode')emit({type:'tool_use',part:{id:'read',type:'tool',tool:'webfetch',state:{status:'completed',input:{url:results[0].url},output:'Verified research context.'}}});
}
const answer=prompt.includes('WAIT_FOREVER')?'Answer parcial':research?'Una respuesta con source [Scientific reference](https://example.org/study).':'Una respuesta con source [1].';
if(id==='codex'){
  emit({type:'item.completed',item:{id:'r',type:'reasoning',text:'Private reasoning'}});
  emit({type:'item.completed',item:{id:'m',type:'agent_message',text:answer}});
  emit({type:'turn.completed'});
}else if(id==='claude'){
  const parts=prompt.includes('WAIT_FOREVER')?[answer]:prompt.includes('SLOW_STREAM')?['Primera parte ','segunda parte']:['Una respuesta ',answer.slice('Una respuesta '.length)];
  for(const [index,text] of parts.entries()){
    if(index&&prompt.includes('SLOW_STREAM'))await new Promise(resolve=>setTimeout(resolve,400));
    emit({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text}}});
  }
  emit({type:'assistant',message:{content:[{type:'text',text:answer}]}});
  emit({type:'result',is_error:false,result:answer});
}else{
  emit({type:'text',part:{id:'part-1',text:'Una respuesta '}});
  emit({type:'text',part:{id:'part-1',text:answer}});
}
if(prompt.includes('WAIT_FOREVER'))setInterval(()=>{},1000);
}
