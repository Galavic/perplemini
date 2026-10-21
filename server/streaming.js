import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

function queue() {
  const items=[];let wake,ended=false,error;
  return {
    push(value){if(!ended){items.push(value);wake?.();wake=null;}},
    end(failure){if(!ended){error=failure;ended=true;wake?.();wake=null;}},
    async *[Symbol.asyncIterator](){
      while(true){
        if(items.length){yield items.shift();continue;}
        if(ended){if(error)throw error;return;}
        await new Promise(resolve=>{wake=resolve;});
      }
    },
  };
}

async function shutdown(child,stop) {
  if(child.exitCode!==null||child.signalCode!==null)return;
  const closed=new Promise(resolve=>child.once('close',resolve));
  stop(child);
  await Promise.race([closed,delay(3000,undefined,{ref:false})]);
}

export function codexStreamArgs(research) {
  return ['app-server','--listen','stdio://',...Object.entries({
    approval_policy:'never',sandbox_mode:'read-only',web_search:research?'live':'disabled',
    'features.shell_tool':false,'features.apply_patch_freeform':false,'features.multi_agent':false,
    'features.apps':false,'features.hooks':false,'features.memories':false,project_doc_max_bytes:0,
  }).flatMap(([key,value])=>['-c',`${key}=${JSON.stringify(value)}`])];
}

export const openCodeStreamArgs=port=>['serve','--hostname','127.0.0.1','--port',String(port)];

export async function* streamCodex({resolved,workdir,env,prompt,images=[],model,research,signal,onEvent,stop,errorFor}) {
  const child=spawn(resolved.command,[...resolved.prefix,...codexStreamArgs(research)],{cwd:workdir,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  const events=queue(),pending=new Map(),blocks=new Map();
  let sequence=0,threadId,received=false,stderr='',bytes=0,finished=false,previousBlock;
  const failure=detail=>new Error(errorFor('codex',detail));
  const fail=error=>{events.end(error);for(const request of pending.values())request.reject(error);pending.clear();};
  const abort=()=>{fail(signal.reason||new Error('Request cancelled.'));stop(child);};
  signal?.addEventListener('abort',abort,{once:true});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-8000);});
  child.on('error',error=>fail(failure(error.message)));
  child.on('close',()=>{if(!finished)fail(failure(stderr));});
  child.stdin.on('error',()=>fail(failure(stderr)));
  const write=message=>child.stdin.write(JSON.stringify(message)+'\n');
  const request=(method,params)=>new Promise((resolve,reject)=>{
    const id=++sequence;pending.set(id,{resolve,reject});
    try{write({id,method,params});}catch(error){pending.delete(id);reject(error);}
  });
  const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
  lines.on('line',line=>{
    bytes+=Buffer.byteLength(line);if(bytes>8_000_000){fail(new Error('CLI output exceeded the size limit.'));stop(child);return;}
    let message;try{message=JSON.parse(line);}catch{return;}
    if(message.id!==undefined&&!message.method){
      const response=pending.get(message.id);if(!response)return;
      pending.delete(message.id);
      if(message.error)response.reject(failure(JSON.stringify(message.error)));else response.resolve(message.result);
      return;
    }
    if(message.id!==undefined&&message.method){
      // No approval, command, external tool or input request is silently granted.
      write({id:message.id,error:{code:-32601,message:'Only native web research is available.'}});
      return;
    }
    if(message.params?.threadId&&threadId&&message.params.threadId!==threadId)return;
    events.push(message);
  });
  try {
    signal?.throwIfAborted();
    await request('initialize',{clientInfo:{name:'perplemini',title:'Perplemini',version:'1.0.0'},capabilities:{experimentalApi:true}});
    write({method:'initialized',params:{}});
    // Empty MCP tables merge with user config, so explicitly disable each configured server.
    const configuration=await request('config/read',{includeLayers:false});
    const config={web_search:research?'live':'disabled','features.shell_tool':false,'features.apply_patch_freeform':false,'features.multi_agent':false,'features.apps':false,'features.hooks':false,'features.memories':false,'features.js_repl':false,'features.browser_use':false,project_doc_max_bytes:0};
    for(const name of Object.keys(configuration?.config?.mcp_servers||{}))config[`mcp_servers.${name}.enabled`]=false;
    const started=await request('thread/start',{cwd:workdir,approvalPolicy:'never',sandbox:'read-only',ephemeral:true,config,...(model?{model}:{})});
    threadId=started?.thread?.id;if(!threadId)throw failure('No thread');
    await request('turn/start',{threadId,input:[{type:'text',text:prompt,text_elements:[]},...images.map(image=>({type:'image',url:`data:${image.mime};base64,${image.data}`}))],...(model?{model}:{})});
    function append(id,text,phase) {
      if(phase==='commentary'||!text)return '';
      const block=blocks.get(id)||{text:'',phase};
      const separator=previousBlock&&previousBlock!==id?'\n\n':'';
      block.text+=text;blocks.set(id,block);previousBlock=id;received=true;
      return separator+text;
    }
    for await(const event of events){
      signal?.throwIfAborted();
      const {method,params:p={}}=event,item=p.item;
      if(method==='item/started'&&item?.type==='agentMessage')blocks.set(item.id,{text:'',phase:item.phase});
      if(method==='item/agentMessage/delta'){
        const text=append(p.itemId,p.delta,blocks.get(p.itemId)?.phase);if(text)yield text;
      }
      if(method==='item/completed'&&item?.type==='agentMessage'){
        const old=blocks.get(item.id)?.text||'';
        const text=append(item.id,item.text?.startsWith(old)?item.text.slice(old.length):old?'':item.text,item.phase);
        if(text)yield text;
      }
      if(method==='item/completed'&&item?.type==='webSearch'){
        const action={...item.action,type:({openPage:'open_page',findInPage:'find_in_page'})[item.action?.type]||item.action?.type};
        onEvent?.({type:'item.completed',item:{...item,type:'web_search',action}});
      }
      if(method==='error'&&!p.willRetry)throw failure(JSON.stringify(p.error));
      if(method==='turn/completed'){
        if(p.turn?.status!=='completed')throw failure(JSON.stringify(p.turn?.error||p.turn?.status));
        if(!received)throw failure('Empty response');
        finished=true;break;
      }
    }
  } finally {
    finished=true;signal?.removeEventListener('abort',abort);lines.close();
    fail(new Error('Session closed.'));
    await shutdown(child,stop);
  }
}

async function freePort() {
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}

export async function* readSse(body) {
  const decoder=new TextDecoder();let pending='';
  for await(const chunk of body){
    pending+=decoder.decode(chunk,{stream:true}).replace(/\r/g,'');
    if(pending.length>8_000_000)throw new Error('The CLI event exceeded the size limit.');
    let end;
    while((end=pending.indexOf('\n\n'))>=0){
      const frame=pending.slice(0,end);pending=pending.slice(end+2);
      const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
      if(!data)continue;
      let parsed;try{parsed=JSON.parse(data);}catch{continue;}
      yield parsed;
    }
  }
}

export async function* streamOpenCode({resolved,workdir,env,prompt,images=[],model,major,signal,onEvent,stop,errorFor}) {
  const port=await freePort(),password=randomBytes(24).toString('hex'),controller=new AbortController();
  const activeSignal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const child=spawn(resolved.command,[...resolved.prefix,...openCodeStreamArgs(port)],{cwd:workdir,env:{...env,OPENCODE_SERVER_PASSWORD:password,OPENCODE_SERVER_USERNAME:'opencode'},shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  let stderr='',finished=false,sessionId,received=false,pump,previousBlock;
  const events=queue(),tools=new Map(),parts=new Map(),roles=new Map();
  const failure=detail=>new Error(errorFor('opencode',detail));
  const abort=()=>{controller.abort();events.end(signal?.reason||failure(stderr));stop(child);};
  signal?.addEventListener('abort',abort,{once:true});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-8000);});
  child.stdout.resume();child.on('error',()=>{events.end(failure(stderr));controller.abort();});
  child.on('close',()=>{if(!finished){events.end(failure(stderr));controller.abort();}});
  const base=`http://127.0.0.1:${port}`,prefix=major>=2?'/api':'';
  const headers={Authorization:`Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`,'Content-Type':'application/json','x-opencode-directory':encodeURIComponent(workdir)};
  async function json(route,body){
    const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.any([activeSignal,AbortSignal.timeout(15000)])});
    if(!response.ok)throw failure(await response.text());
    const text=await response.text();return text?JSON.parse(text):null;
  }
  try {
    signal?.throwIfAborted();
    const deadline=Date.now()+25000;
    while(true){
      try{await json(major>=2?'/api/info':'/global/health');break;}catch(error){if(activeSignal.aborted||Date.now()>deadline)throw error;await delay(120,undefined,{signal:activeSignal});}
    }
    const created=await json(`${prefix}/session`,major>=2?{location:{directory:workdir}}:{});
    sessionId=created?.data?.id||created?.id;if(!sessionId)throw failure('No session');
    const slash=model?.indexOf('/');
    const selected=slash>0?{providerID:model.slice(0,slash),id:model.slice(slash+1).split('#')[0],...(model.includes('#')?{variant:model.split('#')[1]}:{})}:null;
    if(model&&!selected)throw failure('unknown model');
    if(major>=2&&selected)await json(`/api/session/${sessionId}/model`,{model:selected});
    const response=await fetch(base+(major>=2?'/api/event':'/global/event'),{headers:{...headers,Accept:'text/event-stream'},signal:activeSignal});
    if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream'))throw failure('No event stream');
    pump=(async()=>{
      try{for await(const event of readSse(response.body))events.push(event);if(!finished)events.end(new Error('OpenCode streaming was interrupted.'));}
      catch(error){if(!finished)events.end(error);}
    })();
    const body=major>=2?{text:prompt,files:images.map(image=>({uri:`data:${image.mime};base64,${image.data}`,name:image.name}))}:{parts:[{type:'text',text:prompt},...images.map(image=>({type:'file',mime:image.mime,url:`data:${image.mime};base64,${image.data}`,filename:image.name}))],...(selected?{model:{providerID:selected.providerID,modelID:selected.id},...(selected.variant?{variant:selected.variant}:{})}:{})};
    // Begin reading the bus before sending the prompt, including short responses and errors.
    const posting=json(`${prefix}/session/${sessionId}/${major>=2?'prompt':'prompt_async'}`,body).catch(error=>events.end(error));
    function append(key,text,snapshot=false){
      const old=parts.get(key)||'';
      const delta=snapshot?(text.startsWith(old)?text.slice(old.length):old?'':text):text;
      if(!delta)return '';
      const separator=previousBlock&&previousBlock!==key?'\n\n':'';
      parts.set(key,snapshot?text:old+text);previousBlock=key;received=true;return separator+delta;
    }
    let busy=false;
    for await(const raw of events){
      activeSignal.throwIfAborted();
      const event=raw.payload||raw,data=major>=2?event.data:event.properties;
      if(!data)continue;
      const owner=data.sessionID||data.part?.sessionID||data.info?.sessionID;
      if(owner!==sessionId)continue;
      const kind=event.type;
      if(kind==='session.execution.started'||kind==='session.status'&&data.status?.type==='busy')busy=true;
      if(major>=2&&/^session\.text\.(delta|started|ended)$/.test(kind)){
        const text=append(`${data.assistantMessageID}:${data.ordinal??0}`,kind.endsWith('.delta')?data.delta||'':data.text||'',!kind.endsWith('.delta'));
        if(text)yield text;
      }
      if(major>=2&&kind==='session.tool.input.started')tools.set(data.id,{name:data.name,input:{}});
      if(major>=2&&kind==='session.tool.called'){
        const tool=tools.get(data.id);if(tool)tool.input=data.input||{};
      }
      if(major>=2&&['session.tool.called','session.tool.success','session.tool.error','session.tool.failed'].includes(kind)){
        const tool=tools.get(data.id);
        if(tool)onEvent?.({type:'tool_use',part:{id:data.id,type:'tool',tool:tool.name,state:{status:kind.endsWith('.called')?'running':kind.endsWith('.success')?'completed':'error',input:tool.input,output:data.content?.filter(p=>p.type==='text').map(p=>p.text).join('\n')}}});
        if(!kind.endsWith('.called'))tools.delete(data.id);
      }
      if(major<2&&kind==='message.updated')roles.set(data.info?.id,data.info?.role);
      if(major<2&&kind==='message.part.updated'){
        const part=data.part;
        if(part?.type==='text'&&roles.get(part.messageID)==='assistant'){
          const text=append(part.id,part.text||'',true);if(text)yield text;
        }
        if(part?.type==='tool')onEvent?.({type:'tool_use',part});
      }
      // v1 text snapshots above are cumulative; never forward untyped deltas (they can be reasoning).
      if(kind==='permission.asked'&&data.id){
        await json(major>=2?`/api/session/${sessionId}/permissions/${data.id}`:`/permission/${data.id}/reply`,{reply:'reject'});
      }
      if(kind==='session.error'||kind==='session.execution.failed')throw failure(JSON.stringify(data.error));
      if(kind==='session.execution.interrupted'||kind==='session.interrupted')throw new Error('Response stopped.');
      if(kind==='session.execution.succeeded'||major<2&&busy&&(kind==='session.idle'||kind==='session.status'&&data.status?.type==='idle')){
        await posting;if(!received)throw failure('Empty response');finished=true;break;
      }
    }
  } finally {
    finished=true;controller.abort();signal?.removeEventListener('abort',abort);events.end();
    await shutdown(child,stop);await pump;
  }
}
