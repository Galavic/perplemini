import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getCliStatus, resolveCli, terminateTree } from './cli.js';

const cache = new Map();
export const validModel = value => typeof value === 'string' && (value === '' || /^[A-Za-z0-9][A-Za-z0-9._:/@#+-]{0,199}$/.test(value));
export function normalizeModels(items, source) {
  const seen = new Set();
  return items.flatMap(item => {
    if(!item || (typeof item!=='string' && typeof item!=='object'))return [];
    const id = typeof item === 'string' ? item : item.model || item.id;
    if (!id || !validModel(id) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: typeof item === 'string' ? id : String(item.displayName || item.name || id).slice(0,150), source }];
  }).slice(0,500);
}

function probe(resolved, args, workdir, env, codex = false) {
  return new Promise(resolve => {
    let settled = false, output = '', bytes = 0, data = [], cursor, page = 0;
    const child = spawn(resolved.command, [...resolved.prefix,...args], { cwd:workdir, env:{...env,NO_COLOR:'1'}, shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','ignore'] });
    const finish = (models, error = null) => {
      if(settled)return;settled=true;clearTimeout(timer);terminateTree(child);
      resolve({models,error});
    };
    const timer = setTimeout(()=>finish([], 'The CLI model catalog request timed out.'),10000);
    child.on('error',()=>finish([], 'The model listing command could not be run.'));
    child.stdin.on('error',()=>{});
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>2_000_000)finish([], 'The model catalog exceeded the size limit.');});
    if(codex){
      const send = message => child.stdin.write(JSON.stringify(message)+'\n');
      const list = () => send({id:2,method:'model/list',params:{limit:100,includeHidden:false,...(cursor?{cursor}:{})}});
      const lines = createInterface({input:child.stdout,crlfDelay:Infinity});
      lines.on('line',line=>{
        if(settled)return;
        let message;try{message=JSON.parse(line);}catch{return;}
        if(message.error&&(message.id===1||message.id===2))return finish([], 'Codex could not return its model catalog.');
        if(message.id===1){send({method:'initialized',params:{}});list();}
        if(message.id===2){
          data.push(...(message.result?.data||[]).filter(m=>!m.hidden));
          const next=message.result?.nextCursor;
          if(next&&next!==cursor&&++page<5){cursor=next;list();}
          else finish(normalizeModels(data,'cli'));
        }
      });
      send({id:1,method:'initialize',params:{clientInfo:{name:'perplemini',title:'Perplemini',version:'1.0.0'},capabilities:{experimentalApi:false}}});
    }else{
      child.stdin.end();
      child.stdout.on('data',chunk=>{output+=chunk.toString();});
    }
    child.on('close',code=>{
      if(settled)return;
      if(codex||code!==0)return finish([], 'The CLI could not return its model catalog.');
      const names=output.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s.includes('/')&&validModel(s));
      finish(normalizeModels(names,'cli'));
    });
  });
}

export async function getModelCatalog(env = process.env) {
  const providers=await getCliStatus(env);
  return Promise.all(providers.map(async provider=>{
    const key=JSON.stringify([provider.id,provider.version,env[`CLI_${provider.id.toUpperCase()}_PATH`],provider.model]);
    let entry=cache.get(key);
    if(!entry||Date.now()-entry.time>60000){
      let result={models:[],error:null};
      if(provider.installed){
        if(provider.id==='claude'){
          result.models=normalizeModels([{id:'fable',name:'Fable'},{id:'opus',name:'Opus'},{id:'sonnet',name:'Sonnet'},{id:'haiku',name:'Haiku'}],'alias');
        }else{
          const resolved=await resolveCli(provider.id,env);
          const dir=await mkdtemp(path.join(tmpdir(),'perplemini-models-'));
          try{
            const args=provider.id==='codex'?['app-server','--listen','stdio://','-c','mcp_servers={}']:['models',...(/\bv?2\./.test(provider.version)?['--standalone']:[])];
            result=await probe(resolved,args,dir,env,provider.id==='codex');
          }finally{
            if(path.dirname(dir)===path.resolve(tmpdir())&&path.basename(dir).startsWith('perplemini-models-'))await rm(dir,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
          }
        }
      }
      if(provider.model&&!result.models.some(m=>m.id===provider.model))result.models.unshift(...normalizeModels([provider.model],'configured'));
      entry={...result,time:Date.now()};cache.set(key,entry);
    }
    return {id:provider.id,name:provider.name,installed:provider.installed,models:entry.models,error:entry.error};
  }));
}
