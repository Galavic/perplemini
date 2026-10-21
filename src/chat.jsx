import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamWords } from './stream-words.js';
import { Mascot, mascotState } from './mascot.jsx';
import { SourceFavicon } from './source-favicon.jsx';
import { GlobeHemisphereWest, CaretDown, X, Copy, DownloadSimple, GearSix, ArrowClockwise, ArrowUpRight, Paperclip } from './icons.jsx';

function domainLabel(source) {
  return (source.domain || new URL(source.url).hostname).replace(/^www\./,'');
}

// Convert citations throughout Markdown while leaving code and existing links alone.
function citations(sources) {
  return () => tree => {
    function walk(node) {
      if(node.type==='link'){
        const source=sources.find(source=>source.url===node.url);
        if(source){node.data={...node.data,hProperties:{className:'citation','data-source-id':source.id}};node.children=[{type:'text',value:domainLabel(source)}];}
        return;
      }
      if(!node.children || ['linkReference','code','inlineCode'].includes(node.type))return;
      node.children=node.children.flatMap(child=>{
        if(child.type!=='text'){walk(child);return [child];}
        const result=[];let cursor=0;
        for(const match of child.value.matchAll(/\[(\d+)\]/g)){
          const source=sources.find(s=>s.id===Number(match[1]));
          if(!source)continue;
          if(match.index>cursor)result.push({type:'text',value:child.value.slice(cursor,match.index)});
          result.push({type:'link',url:source.url,title:source.title,data:{hProperties:{className:'citation','data-source-id':source.id}},children:[{type:'text',value:domainLabel(source)}]});
          cursor=match.index+match[0].length;
        }
        if(cursor===0)return [child];
        if(cursor<child.value.length)result.push({type:'text',value:child.value.slice(cursor)});
        return result;
      });
    }
    walk(tree);
  };
}

function StreamWord({node,children,className,...props}){
  const mountedAt=useRef(performance.now());
  if(className!=='stream-word')return <span className={className} {...props}>{children}</span>;
  const born=Number(props['data-stream-born']),delay=Number(props['data-stream-delay']);
  return <span className={className} style={{animationDelay:`${delay-Math.max(0,mountedAt.current-born)}ms`}}>{children}</span>;
}

function AnswerText({ message, onSource, streaming }) {
  const appearance=useRef({live:streaming,words:new Map()});
  if(streaming)appearance.current.live=true;
  return <div className={`markdown ${streaming?'is-streaming':''}`}><Markdown remarkPlugins={[remarkGfm,streamWords(appearance.current),citations(message.sources||[])]} components={{
    span:StreamWord,
    a:({node,className,children,...props})=><a {...props} className={className} target="_blank" rel="noreferrer" onClick={event=>{
      if(className==='citation'&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){event.preventDefault();onSource(Number(props['data-source-id']));}
    }}>{className==='citation'&&<SourceFavicon source={(message.sources||[]).find(source=>source.id===Number(props['data-source-id']))||{url:props.href}} inline/>} {children}</a>,
  }}>{message.content}</Markdown></div>;
}

function SourceEntry({ source, selected }) {
  return <a className={`source-entry ${selected?'is-selected':''}`} href={source.url} target="_blank" rel="noreferrer">
    <div className="source-entry-domain"><SourceFavicon source={source}/><span>{domainLabel(source)}</span><ArrowUpRight size={12}/></div>
    <strong>{source.title}</strong>
    {source.content&&<p>{source.content.slice(0,210)}{source.content.length>210?'…':''}</p>}
  </a>;
}

function ResearchStatus({message,active}){
  const fallbackStart=useRef(Date.now());
  const [now,setNow]=useState(Date.now);
  const waiting=active&&!message.content&&!message.error;
  const startedAt=message.startedAt||fallbackStart.current;
  useEffect(()=>{
    if(!waiting)return;
    setNow(Date.now());
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(timer);
  },[waiting,startedAt]);
  const pendingLabel=message.mode==='writing'?'Preparing answer':'Researching';
  const elapsed=Math.max(0,Math.floor((now-startedAt)/1000));
  const label=waiting?`${pendingLabel} ${elapsed}s`:active&&!message.error?'Responding…':message.error?'Response interrupted':message.mode==='writing'||(message.research?.completed&&!message.research.searched&&!message.research.opened)?'Direct answer':message.durationMs?`Researched in ${Math.max(1,Math.round(message.durationMs/1000))} s`:'Sources consulted';
  return <div className="research-status" role={waiting?'status':undefined} aria-label={waiting?pendingLabel:undefined}><Mascot state={mascotState(message,active)} compact paused={!active}/><span className={waiting?'research-shimmer':undefined} aria-hidden={waiting?true:undefined}>{label}</span></div>;
}

export function ChatView({ thread, busy, view, composer, bottomRef, copy, exportThread, openSettings, retry }) {
  const answers=thread.messages.filter(m=>m.role==='assistant');
  const latest=answers.at(-1);
  const transcriptRef=useRef(null),followRef=useRef(true);
  useEffect(()=>{
    const scroller=transcriptRef.current;
    if(!scroller)return;
    const scroll=()=>{followRef.current=scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<100;};
    const wheel=event=>{if(event.deltaY<0)followRef.current=false;};
    scroller.addEventListener('scroll',scroll,{passive:true});scroller.addEventListener('wheel',wheel,{passive:true});
    return()=>{scroller.removeEventListener('scroll',scroll);scroller.removeEventListener('wheel',wheel);};
  },[thread.id,view]);
  useEffect(()=>{followRef.current=true;},[latest?.id]);
  useEffect(()=>{
    if(!busy||view!=='answer'||!followRef.current)return;
    const frame=requestAnimationFrame(()=>{
      const scroller=transcriptRef.current;
      if(scroller&&followRef.current)scroller.scrollTop=scroller.scrollHeight;
    });
    return()=>cancelAnimationFrame(frame);
  },[latest?.content,busy,view]);
  const [sourceMessageId,setSourceMessageId]=useState(null),[sourceId,setSourceId]=useState(null),[sourcesExpanded,setSourcesExpanded]=useState(true),[drawerOpen,setDrawerOpen]=useState(false);
  useEffect(()=>{setSourceMessageId(latest?.id||null);setSourceId(null);},[thread.id,latest?.id]);
  useEffect(()=>{setDrawerOpen(false);},[thread.id]);
  useEffect(()=>{
    if(!drawerOpen)return;
    const close=event=>{if(event.key==='Escape')setDrawerOpen(false);};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[drawerOpen]);
  const sourceMessage=answers.find(m=>m.id===sourceMessageId)||latest;
  const sourcePriority={cited:0,read:1,result:2};
  const sources=[...(sourceMessage?.sources||[])].sort((a,b)=>(sourcePriority[a.kind]??2)-(sourcePriority[b.kind]??2));
  const sourceQuestion=thread.messages[thread.messages.findIndex(m=>m.id===sourceMessage?.id)-1]?.content||thread.title;
  const focusSource=(message,id)=>{setSourceMessageId(message.id);setSourceId(id||null);setSourcesExpanded(true);setDrawerOpen(true);};
  return <>
    <div className={`chat-layout ${view==='links'?'links-view':''}`}>
      <div className="chat-column">
      {view==='links'?<section ref={transcriptRef} className="conversation links-content" aria-label="Conversation links">
        <div className="links-page-heading"><GlobeHemisphereWest size={21}/><h1>Conversation links</h1></div>
        {answers.some(m=>m.sources?.length)?answers.filter(m=>m.sources?.length).map(message=>{
          const index=thread.messages.findIndex(m=>m.id===message.id);
          return <section className="links-turn" key={message.id}><h2>{thread.messages[index-1]?.content}</h2><div className="all-source-links">{message.sources.map(source=><SourceEntry source={source} key={source.id}/>)}</div></section>;
        }):<div className="chat-empty-sources"><GlobeHemisphereWest size={30}/><h2>No links yet</h2><p>Sources will appear when you ask a question that uses web search.</p></div>}
      </section>:<section ref={transcriptRef} className="conversation" aria-label="Conversation">
        {thread.messages.map((message,index)=>message.role==='user'?<div className="user-message" key={message.id}><div className="user-bubble">{(message.files?.some(file=>file.image)||message.image)&&<div className="user-images">{(message.files||[{image:message.image,name:message.file}]).filter(file=>file.image).map((file,index)=><img key={index} className="user-image" src={file.image} alt={file.name||"Attached image"} title={file.name}/>)}</div>}<p>{message.content}</p>{message.file&&<span className="file-tag"><Paperclip size={13}/>{message.file}</span>}</div></div>:<article className="answer" key={message.id}>
          <ResearchStatus message={message} active={busy&&index===thread.messages.length-1}/>
          {!(busy&&index===thread.messages.length-1)&&message.research?.steps?.length>0&&<details className="research-activity"><summary>{message.research.steps.length} research {message.research.steps.length===1?'step':'steps'}</summary><ol>{message.research.steps.map((step,i)=><li key={i}>{step.action==='search'?<GlobeHemisphereWest size={13}/>:<ArrowUpRight size={13}/>}<span><strong>{step.action==='search'?'Search':'Reading'}</strong>{step.detail&&<span>{step.detail}</span>}</span></li>)}</ol></details>}
          {message.content&&<AnswerText message={message} streaming={busy&&index===thread.messages.length-1} onSource={id=>focusSource(message,id)}/>}
          {message.error&&<div className="error-panel" role="alert"><strong>{message.content?'The answer is incomplete':'The response could not be completed'}</strong><p>{message.error}</p><button onClick={openSettings}><GearSix size={15}/>Review settings</button>{!busy&&<button onClick={()=>retry(thread.messages[index-1]?.content||'')}><ArrowClockwise size={15}/>Ask again</button>}</div>}
          {!busy&&(message.content||message.sources?.length>0)&&<div className="answer-actions">
            {message.content&&<button className="icon-button" title="Copy answer" aria-label="Copy answer" onClick={()=>copy(message.content)}><Copy size={17}/></button>}
            <button className="icon-button" title="Export conversation" aria-label="Export conversation" onClick={()=>exportThread(thread)}><DownloadSimple size={17}/></button>
            {message.sources?.length>0&&<button className="source-summary" onClick={()=>focusSource(message)} aria-label={`View ${message.sources.length} sources for this answer`}><span className="source-stack">{message.sources.slice(0,3).map(source=><SourceFavicon source={source} key={source.id}/>)}</span>{message.sources.length} {message.sources.length===1?'source':'sources'}</button>}
            <span className="answer-provider">{message.cliName||'Previous provider'}{message.model?' · '+message.model:''}</span>
          </div>}
        </article>)}
        <div ref={bottomRef}/>
      </section>}
      <div className="followup-container">{composer}<p>AI can make mistakes. Check the sources.</p></div>
      </div>
      {drawerOpen&&<div className="source-drawer-backdrop" onClick={()=>setDrawerOpen(false)}/>}
      <aside className={`sources-panel ${drawerOpen?'sources-drawer-open':''} ${sources.length?'has-sources':'sources-empty'}`} hidden={view==='links'} aria-label="Answer sources">
        <div className="sources-panel-heading"><button onClick={()=>setSourcesExpanded(!sourcesExpanded)} aria-expanded={sourcesExpanded}><span>Sources{sources.length>0&&<small>{sources.length}</small>}</span><CaretDown size={15} className={!sourcesExpanded?'is-collapsed':''}/></button><button className="icon-button source-panel-close" aria-label="Close sources" onClick={()=>setDrawerOpen(false)}><X size={17}/></button></div>
        {sourcesExpanded&&<div className="sources-panel-body">{sources.length>0?<><p className="source-query">Results for “{sourceQuestion}”</p>{sources.map(source=><SourceEntry key={source.id} source={source} selected={source.id===sourceId}/>)}</>:<p className="source-panel-empty">{busy?'Sources will appear here when AI searches the web.':sourceMessage?.mode==='writing'?'Writing mode does not use web sources.':'This answer has no web sources.'}</p>}</div>}
      </aside>
    </div>
  </>;
}
