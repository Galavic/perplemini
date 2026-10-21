import http from 'node:http';
import {createInterface} from 'node:readline';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

async function capture(value){if(process.env.CLI_FIXTURE_CAPTURE)await writeFile(process.env.CLI_FIXTURE_CAPTURE,JSON.stringify({...value,cwd:process.cwd(),pid:process.pid}));}
const sources=[{ref_id:'turn0search0',title:'Scientific reference',url:'https://example.org/study',snippet:'Verified research context.'}];
const queries=['consulta específica elegida por la IA','contrastar la evidencia de la primera búsqueda'];
function answerParts(prompt,research){
  if(prompt.includes('WAIT_FOREVER'))return ['Answer parcial',null];
  if(prompt.includes('SLOW_STREAM'))return ['Primera parte ','segunda parte'];
  return ['Una respuesta ',research?'con source [Scientific reference](https://example.org/study).':'con source [1].'];
}

export function codexFixture(args){
  const lines=createInterface({input:process.stdin});let config={},model;
  const emit=value=>console.log(JSON.stringify(value));
  lines.on('line',async line=>{
    const request=JSON.parse(line),reply=result=>emit({id:request.id,result});
    if(request.method==='initialize')reply({});
    if(request.method==='config/read')reply({config:{mcp_servers:{external:{}}}});
    if(request.method==='model/list')reply({data:[{model:'fixture-model',displayName:'Fixture model'},{model:'hidden-model',hidden:true}],nextCursor:null});
    if(request.method==='thread/start'){config=request.params.config;model=request.params.model;reply({thread:{id:'fixture-thread'}});}
    if(request.method==='turn/start'){
      const prompt=request.params.input[0].text,research=config.web_search==='live';
      await capture({id:'codex',prompt,args,model,threadConfig:config,input:request.params.input});
      if(prompt.includes('FAIL_AUTH')){emit({id:request.id,error:{message:'not logged in'}});return;}
      reply({turn:{id:'fixture-turn',status:'inProgress'}});
      if(research){
        for(const [index,query] of queries.entries())emit({method:'item/completed',params:{threadId:'fixture-thread',item:{id:`search-${index}`,type:'webSearch',action:{type:'search',query},results:sources}}});
        emit({method:'item/completed',params:{threadId:'fixture-thread',item:{id:'read',type:'webSearch',action:{type:'openPage',url:sources[0].url},results:sources}}});
      }
      const item={id:'answer',type:'agentMessage',phase:'final_answer'};
      emit({method:'item/reasoning/textDelta',params:{threadId:'fixture-thread',delta:'PRIVATE_REASONING'}});
      emit({method:'item/started',params:{threadId:'fixture-thread',item}});
      if(!prompt.includes('EMPTY_RESPONSE')){
        const parts=answerParts(prompt,research);
        emit({method:'item/agentMessage/delta',params:{threadId:'fixture-thread',itemId:item.id,delta:parts[0]}});
        if(parts[1]===null)return;
        await delay(prompt.includes('SLOW_STREAM')?400:25);
        emit({method:'item/agentMessage/delta',params:{threadId:'fixture-thread',itemId:item.id,delta:parts[1]}});
        emit({method:'item/completed',params:{threadId:'fixture-thread',item:{...item,text:parts.join('')}}});
      }
      emit({method:'turn/completed',params:{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'completed'}}});
    }
  });
}

export async function openCodeFixture(args){
  const config=JSON.parse(await readFile('opencode.json','utf8'));
  const research=config.permissions.some(rule=>rule.action==='websearch'&&rule.effect==='allow');
  const clients=new Set();let model;
  const emit=(type,data)=>{for(const client of clients)client.write(`data: ${JSON.stringify({type,data:{sessionID:'fixture-session',assistantMessageID:'fixture-message',...data}})}\n\n`);};
  const server=http.createServer(async(req,res)=>{
    if(req.headers.authorization!==`Basic ${Buffer.from(`opencode:${process.env.OPENCODE_SERVER_PASSWORD}`).toString('base64')}`){res.writeHead(401);res.end();return;}
    if(req.url==='/api/event'){
      res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;
    }
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/info'){res.end(JSON.stringify({version:'2.0.0'}));return;}
    if(req.url==='/api/session'){res.end(JSON.stringify({data:{id:'fixture-session'}}));return;}
    if(req.url.endsWith('/model')){model=body.model;res.end('{}');return;}
    if(req.url.endsWith('/prompt')){
      // Match the installed v2 HTTP input contract, not its internal stored file shape.
      if(body.files?.some(file=>typeof file.uri!=='string'||Object.keys(file).some(key=>!['uri','name','description','mention'].includes(key)))){
        res.writeHead(400);res.end(JSON.stringify({_tag:'InvalidRequestError',message:'Missing key at files[0][uri]',kind:'Payload'}));return;
      }
      const prompt=body.text;
      await capture({id:'opencode',prompt,args,config,files:body.files,model:model?model.providerID+'/'+model.id+(model.variant?'#'+model.variant:''):undefined});
      res.end('{}');
      emit('session.execution.started',{});
      if(prompt.includes('FAIL_AUTH')){emit('session.execution.failed',{error:{message:'401 unauthorized'}});return;}
      if(research){
        for(const [index,query] of queries.entries()){
          emit('session.tool.input.started',{id:`search-${index}`,name:'websearch'});
          emit('session.tool.called',{id:`search-${index}`,input:{query}});
          emit('session.tool.success',{id:`search-${index}`,content:[{type:'text',text:JSON.stringify({results:sources})}]});
        }
        emit('session.tool.input.started',{id:'read',name:'webfetch'});
        emit('session.tool.called',{id:'read',input:{url:sources[0].url}});
        emit('session.tool.success',{id:'read',content:[{type:'text',text:'Verified research context.'}]});
      }
      emit('session.reasoning.delta',{delta:'PRIVATE_REASONING'});
      if(!prompt.includes('EMPTY_RESPONSE')){
        const parts=answerParts(prompt,research);
        emit('session.text.started',{ordinal:0,text:''});
        emit('session.text.delta',{ordinal:0,delta:parts[0]});
        if(parts[1]===null)return;
        await delay(prompt.includes('SLOW_STREAM')?400:25);
        emit('session.text.delta',{ordinal:0,delta:parts[1]});
        emit('session.text.ended',{ordinal:0,text:parts.join('')});
      }
      emit('session.execution.succeeded',{});return;
    }
    res.end('{}');
  });
  server.listen(Number(args[args.indexOf('--port')+1]),'127.0.0.1');
}
