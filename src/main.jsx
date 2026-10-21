import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowUp, ArrowUpRight, ClockCounterClockwise, FolderSimple, Plus, MagnifyingGlass, Compass, Books, GearSix, SidebarSimple, GlobeHemisphereWest, Feather, GraduationCap, Paperclip, X, Check, Copy, DownloadSimple, Trash, BookmarkSimple, Stop, CaretDown, ArrowClockwise, Sun, Moon, Sparkle, Lightning, Code, Plant, Atom, ChatCircle } from './icons.jsx';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import './workspace.css';
import './chat.css';
import { ChatView } from './chat.jsx';
import { ATTACHMENT_ACCEPT, readAttachment } from './attachments.js';
import { Mascot } from './mascot.jsx';
import { useAppScrollbars } from './scrollbars.js';
import { CLI_CHOICES, CliPicker, CliSettings } from './cli.jsx';

const discoveries=[{tag:'Science',icon:Atom,title:'Small things that change everything',description:'An introduction to quantum computing and its possibilities.',q:'What is quantum computing and what are its applications?',tone:'mint'},{tag:'Technology',icon:Code,title:'A world of open source',description:'The ideas and communities behind the software we share.',q:'What is open-source software and why does it matter?',tone:'sand'},{tag:'Nature',icon:Plant,title:'The intelligence of nature',description:'How ecosystems find their own balance.',q:'How do trees communicate in a forest?',tone:'sage'},{tag:'Universe',icon:Sparkle,title:'Questions beyond Earth',description:'Explore space and what is still waiting to be discovered.',q:'What do we know about habitable exoplanets?',tone:'lavender'}];
const modes={web:{label:'Search',icon:GlobeHemisphereWest},academic:{label:'Academic',icon:GraduationCap},writing:{label:'Write',icon:Feather}};
function readStorage(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function IconButton({label,children,...props}){return <button className="icon-button" title={label} aria-label={label} {...props}>{children}</button>;}
function App(){
  useAppScrollbars();
  const [threads,setThreads]=useState(()=>{const s=readStorage('perplemini.threads',[]);return Array.isArray(s)?s:[];});
  const [active,setActive]=useState(null),[page,setPage]=useState('home'),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[mode,setMode]=useState('web'),[deep,setDeep]=useState(false),[modeMenu,setModeMenu]=useState(false),[settings,setSettings]=useState(false),[status,setStatus]=useState(null),[theme,setTheme]=useState(()=>readStorage('perplemini.theme','light')),[sidebar,setSidebar]=useState(false),[attachments,setAttachments]=useState([]),[notice,setNotice]=useState(''),[libraryFilter,setLibraryFilter]=useState(''),[savedOnly,setSavedOnly]=useState(false),[deleteId,setDeleteId]=useState(null);
  const [collapsed,setCollapsed]=useState(false);
  const [chatView,setChatView]=useState('answer');
  const [cliProvider,setCliProvider]=useState(()=>readStorage('perplemini.cli','codex'));
  const [checkingCli,setCheckingCli]=useState(false);
  const [modelCatalogs,setModelCatalogs]=useState([]);
  const [loadingModels,setLoadingModels]=useState(false);
  const [cliModels,setCliModels]=useState(()=>{const saved=readStorage('perplemini.cliModels',{});return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};});
  const cliModel=cliModels[cliProvider]||'';
  function selectCli(id,model){setCliProvider(id);if(typeof model==='string')setCliModels(previous=>({...previous,[id]:model}));}
  function toggleSidebar(){if(window.innerWidth<=760)setSidebar(v=>!v);else setCollapsed(v=>!v);}
  const abortRef=useRef(null),inputRef=useRef(null),fileRef=useRef(null),bottomRef=useRef(null);
  const composerRef=useRef(null),composerOrigin=useRef(null);
  useLayoutEffect(()=>{
    const origin=composerOrigin.current;
    composerOrigin.current=null;
    const form=composerRef.current;
    if(page!=='chat'||!origin||!form||typeof form.animate!=='function'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const animations=[];
    const resize=()=>animations.forEach(animation=>animation.cancel());
    try{
      // FLIP: measure the final layout once, then bridge both positions on the compositor.
      const destination=form.getBoundingClientRect();
      if(![origin.x,origin.y,origin.width,origin.height,destination.x,destination.y,destination.width,destination.height].every(Number.isFinite)||origin.width<=0||origin.height<=0||destination.width<=0||destination.height<=0)return;
      const token=getComputedStyle(form).getPropertyValue('--ease-in-out').trim();
      const easing=CSS.supports('animation-timing-function',token)?token:'cubic-bezier(0.77, 0, 0.175, 1)';
      animations.push(form.animate([
        {transform:`translate(${origin.x-destination.x}px, ${origin.y-destination.y}px) scale(${origin.width/destination.width}, ${origin.height/destination.height})`},
        {transform:'none'},
      ],{duration:280,easing}));
      for(const child of form.children)animations.push(child.animate([{opacity:0},{opacity:1}],{duration:180,delay:70,fill:'backwards',easing:'cubic-bezier(0.23, 1, 0.32, 1)'}));
    }catch{
      // Motion is optional: restore the final layout if any animation cannot start.
      resize();
      return;
    }
    window.addEventListener('resize',resize,{once:true});
    return()=>{resize();window.removeEventListener('resize',resize);};
  },[page,active]);
  const attachmentsRef=useRef([]),attachmentEpoch=useRef(0),attachmentQueue=useRef(Promise.resolve());
  function replaceAttachments(files){attachmentsRef.current=files;setAttachments(files);}
  function clearAttachments(){attachmentEpoch.current++;replaceAttachments([]);}
  const attachedImages=attachments.filter(file=>file.kind==='image');
  const current=threads.find(t=>t.id===active);
  async function refreshStatus(){
    setCheckingCli(true);
    refreshModels();
    try{
      const r=await fetch('/api/status');
      if(!r.ok)throw new Error('status');
      const data=await r.json();setStatus(data);
      if(data.cliProviders)setCliProvider(previous=>data.cliProviders.some(p=>p.id===previous&&p.installed)?previous:data.cliProviders.find(p=>p.id===data.defaultCli&&p.installed)?.id||data.cliProviders.find(p=>p.installed)?.id||data.defaultCli||'codex');
    }catch{setStatus({available:false,provider:'Disconnected',cliProviders:[]});}
    finally{setCheckingCli(false);}
  }
  async function refreshModels(){
    setLoadingModels(true);
    try{const r=await fetch('/api/models');if(!r.ok)throw new Error('catalog');const data=await r.json();setModelCatalogs(Array.isArray(data.providers)?data.providers:[]);}
    catch{setModelCatalogs([]);}
    finally{setLoadingModels(false);}
  }
  useEffect(()=>{localStorage.setItem('perplemini.cliModels',JSON.stringify(cliModels));},[cliModels]);
  useEffect(()=>{localStorage.setItem('perplemini.cli',JSON.stringify(cliProvider));},[cliProvider]);
  useEffect(()=>{refreshStatus();},[]);
  useEffect(()=>{try{localStorage.setItem('perplemini.threads',JSON.stringify(threads));}catch{setNotice('Local storage is full. Export some conversations and delete them to make room.');}},[threads]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('perplemini.theme',JSON.stringify(theme));},[theme]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{
    if(!settings&&!deleteId)return;
    const previous=document.activeElement;
    const dialog=document.querySelector('[role="dialog"]');
    const focusable=()=>[...dialog.querySelectorAll('button:not(:disabled), a[href], input, textarea')];
    focusable()[0]?.focus();
    const trap=e=>{if(e.key!=='Tab')return;const items=focusable(),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}};
    document.addEventListener('keydown',trap);
    return()=>{document.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus();};
  },[settings,deleteId]);
  useEffect(()=>{const fn=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();inputRef.current?.focus();}if(e.key==='Escape'){setSettings(false);setModeMenu(false);setSidebar(false);setDeleteId(null);}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn);},[]);
  function navigate(p){if(busy)return;setPage(p);setSidebar(false);setInput('');clearAttachments();if(p==='home')setActive(null);}
  function openThread(id){if(busy)return;setActive(id);setPage('chat');setChatView('answer');setSidebar(false);setInput('');clearAttachments();}
  function patchMessage(tid,mid,patch){setThreads(ts=>ts.map(t=>t.id===tid?{...t,messages:t.messages.map(m=>m.id===mid?{...m,...(typeof patch==='function'?patch(m):patch)}:m)}:t));}
  async function submit(event,provided){
    event?.preventDefault();const question=(provided??input).trim()||(attachedImages.length?(attachedImages.length===1?'Describe this image.':'Describe these images.'):'');if(!question||busy)return;
    if(question.length>12000){setNotice('Questions can contain up to 12,000 characters.');return;}
    if(page==='home')composerOrigin.current=composerRef.current?.getBoundingClientRect();
    const tid=current?.id||crypto.randomUUID(),mid=crypto.randomUUID();
    const history=(current?.messages||[]).filter(m=>m.role==='user'||(m.content&&!m.error)).slice(-14).map(({role,content})=>({role,content}));
    const user={id:crypto.randomUUID(),role:'user',content:question,files:attachments.map(file=>({name:file.name,image:file.preview})),file:attachments.filter(file=>file.kind==='text').map(file=>file.name).join(', ')};
    const startedAt=Date.now();
    const assistant={id:mid,startedAt,role:'assistant',content:'',sources:[],mode,deep,cliProvider,model:cliModel,cliName:CLI_CHOICES.find(p=>p.id===cliProvider)?.name};
    const files=attachments;
    setThreads(ts=>current?ts.map(t=>t.id===tid?{...t,updated:Date.now(),messages:[...t.messages,user,assistant]}:t):[{id:tid,title:question,updated:Date.now(),saved:false,messages:[user,assistant]},...ts]);
    setActive(tid);setPage('chat');setChatView('answer');setInput('');clearAttachments();setBusy(true);
    const controller=new AbortController();abortRef.current=controller;
    let ended=false;
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[...history,{role:'user',content:question}],mode,deep,attachment:files.filter(file=>file.kind==='text').map(file=>file.text).join('\n\n'),images:files.filter(file=>file.kind==='image').map(({mime,data,name})=>({mime,data,name})),cliProvider,cliModel}),signal:controller.signal});
      if(!r.ok){const data=await r.json();throw new Error(data.error||'The request could not be completed.');}
      const reader=r.body.getReader(),decoder=new TextDecoder();let pending='';
      function consume(line){if(!line.trim())return;const event=JSON.parse(line);
        if(event.type==='cli')patchMessage(tid,mid,{cliProvider:event.id,cliName:event.name,model:event.model});
        if(event.type==='sources')patchMessage(tid,mid,{sources:event.sources,provider:event.provider});
        if(event.type==='research')patchMessage(tid,mid,{research:{steps:event.steps,searched:event.searched,opened:event.opened,completed:event.completed}});
        if(event.type==='answer')patchMessage(tid,mid,{content:event.text});
        if(event.type==='token'){patchMessage(tid,mid,m=>({content:m.content+event.text}));}
        if(event.type==='error'){ended=true;patchMessage(tid,mid,{error:event.message});}
        if(event.type==='done')ended=true;
      }
      while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const lines=pending.split('\n');pending=lines.pop();lines.forEach(consume);}
      pending+=decoder.decode();if(pending.trim())consume(pending);
      if(!ended)throw new Error('The connection ended before the response was complete. Please try again.');
    }catch(error){patchMessage(tid,mid,{error:error.name==='AbortError'?'Response stopped.':error.message});}
    finally{patchMessage(tid,mid,{durationMs:Date.now()-startedAt});setBusy(false);abortRef.current=null;}
  }
  function attachFiles(fileList){
    if(busy)return;
    const files=Array.from(fileList),epoch=attachmentEpoch.current;
    attachmentQueue.current=attachmentQueue.current.then(async()=>{
      for(const file of files){
        if(epoch!==attachmentEpoch.current)return;
        if(attachmentsRef.current.length>=8){setNotice('You can attach up to 8 files per message.');break;}
        try{
          const attachment={...await readAttachment(file),id:crypto.randomUUID(),size:file.size};
          if(epoch!==attachmentEpoch.current)return;
          const current=attachmentsRef.current;
          if(attachment.kind==='image'&&current.filter(file=>file.kind==='image').reduce((size,file)=>size+file.size,0)+file.size>20*1024*1024)throw new Error('Images can total up to 20 MB per message.');
          if(attachment.kind==='text'&&current.filter(file=>file.kind==='text').reduce((size,file)=>size+file.text.length+2,0)+attachment.text.length>60000)throw new Error('Text files can total up to 60 KB per message.');
          replaceAttachments([...current,attachment]);
        }catch(error){setNotice(error.message);}
      }
      inputRef.current?.focus();
    });
  }
  function addFile(event){const files=Array.from(event.target.files);event.target.value='';attachFiles(files);}
  function pasteImage(event){
    const files=[...event.clipboardData.items].filter(item=>item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
    if(files.length){event.preventDefault();attachFiles(files);}
  }
  async function copy(text,success='Answer copied.'){try{await navigator.clipboard.writeText(text);setNotice(success);}catch{setNotice('The browser could not copy the text. Select and copy it manually.');}}
  function exportThread(t){const text=`# ${t.title}\n\n`+t.messages.map(m=>`${m.role==='user'?'## You':'## Perplemini'}\n\n${m.content}${m.error?'\n\nNotice: '+m.error:''}\n\n${m.sources?.map(s=>`[${s.id}] ${s.title}: ${s.url}`).join('\n')||''}`).join('\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`perplemini-${t.id.slice(0,8)}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function toggleSave(t){setThreads(ts=>ts.map(x=>x.id===t.id?{...x,saved:!x.saved}:x));}
  const ModeIcon=modes[mode].icon;
  const composer=<form ref={composerRef} className={`composer ${page==='chat'?'composer-followup':''} ${input||attachments.length?'has-content':''}`} onSubmit={submit} onDragOver={event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();}} onDrop={event=>{if(event.dataTransfer.files.length){event.preventDefault();attachFiles(event.dataTransfer.files);}}}>
    {attachments.length>0&&<div className="attachment-list" aria-label="Attachments">{attachments.map(file=><div key={file.id} className={`attachment ${file.kind==='image'?'image-attachment':''}`} title={file.name}>
      {file.preview?<img src={file.preview} alt={`Preview: ${file.name}`}/>:<><Paperclip size={14}/><span>{file.name}</span></>}
      <IconButton label={`Remove attachment ${file.name}`} onClick={()=>replaceAttachments(attachmentsRef.current.filter(item=>item.id!==file.id))} type="button"><X size={12}/></IconButton>
    </div>)}</div>}
    <div className="search-line"><IconButton label="Attach images or files" type="button" onClick={()=>fileRef.current.click()} disabled={busy}><Plus size={18}/></IconButton><textarea ref={inputRef} aria-label="Your question" placeholder={page==='chat'?'Ask a follow-up question…':'Ask anything…'} value={input} rows={1} maxLength={12000} disabled={busy} onPaste={pasteImage} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/>
    {busy?<button className="send-button stop-button" type="button" aria-label="Stop response" onClick={()=>abortRef.current?.abort()}><Stop weight="fill" size={15}/></button>:<button className="send-button" type="submit" aria-label="Send question" disabled={!input.trim()&&!attachedImages.length}><ArrowUp size={17}/></button>}</div>
    <div className="composer-bottom"><div className="composer-tools"><div className="mode-wrap"><button className="mode-button" type="button" aria-expanded={modeMenu} onClick={()=>setModeMenu(!modeMenu)} disabled={busy}><ModeIcon size={18}/>{modes[mode].label}<CaretDown size={12}/></button>{modeMenu&&<div className="mode-menu">{Object.entries(modes).map(([key,value])=>{const I=value.icon;return <button key={key} type="button" disabled={key==='academic'&&!status?.academic} onClick={()=>{setMode(key);setModeMenu(false);}}><I size={19}/><span>{value.label}<small>{key==='web'?'Answers with sources':key==='academic'?'Articles and publications':'Write without searching the web'}</small></span>{mode===key&&<Check size={16}/>}</button>;})}</div>}</div><span className="tool-divider"/><button type="button" className={`deep-button ${deep?'selected':''}`} aria-pressed={deep} title="AI researches more deeply, reads and compares multiple sources" onClick={()=>setDeep(!deep)} disabled={busy||mode==='writing'}><Sparkle size={17}/><span>Deep research</span></button></div><input hidden ref={fileRef} type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={addFile}/><CliPicker providers={status?.cliProviders} catalogs={modelCatalogs} value={cliProvider} model={cliModel} onChange={selectCli} loadingModels={loadingModels} disabled={busy||checkingCli}/></div>

  </form>;
  return <div className={`app-shell ${collapsed?'sidebar-collapsed':''} ${page==='chat'?'chat-is-open':''}`}>
    {sidebar&&<div className="sidebar-scrim" onClick={()=>setSidebar(false)}/>}
    <aside className={`sidebar ${sidebar?'is-open':''}`}>
      <div className="sidebar-heading"><button className="brand-button" onClick={()=>navigate('home')} aria-label="Go to home"><span className="workspace-monogram">p.</span><span>perplemini</span></button><IconButton label="Hide sidebar" onClick={()=>{setSidebar(false);if(window.innerWidth>760)setCollapsed(true);}}><SidebarSimple size={16}/></IconButton></div>

      <button className="new-thread" onClick={()=>navigate('home')} disabled={busy}><Plus size={19}/><span>New search</span><kbd>Ctrl K</kbd></button>
      <nav aria-label="Main navigation"><button className={['home','chat'].includes(page)?'nav-active':''} onClick={()=>navigate('home')} disabled={busy}><MagnifyingGlass size={22}/><span>Home</span></button><button className={page==='discover'?'nav-active':''} onClick={()=>navigate('discover')} disabled={busy}><Compass size={22}/><span>Discover</span></button><button className={page==='library'?'nav-active':''} onClick={()=>navigate('library')} disabled={busy}><Books size={22}/><span>Library</span>{threads.length>0&&<small>{threads.length}</small>}</button></nav>
      <div className="saved-nav"><div className="section-label">Collections</div><button onClick={()=>{navigate('library');setSavedOnly(true);}} disabled={busy}><FolderSimple size={15}/>Saved items<BookmarkSimple className="nav-end-icon" size={12}/></button><button onClick={()=>navigate('discover')} disabled={busy}><FolderSimple size={15}/>Inspiration</button></div>
      <div className="history"><div className="section-label">Conversations</div><div className="history-list">{threads.length?threads.slice(0,10).map(t=><button key={t.id} disabled={busy} onClick={()=>openThread(t.id)} className={`history-item ${active===t.id&&page==='chat'?'history-active':''}`}><ChatCircle size={14}/><span>{t.title}</span>{t.saved&&<BookmarkSimple size={12} weight="fill"/>}</button>):<div className="history-empty"><span>No conversations yet</span></div>}</div></div>
      <div className="sidebar-bottom"><button onClick={()=>{navigate('library');setSavedOnly(false);}} disabled={busy}><ClockCounterClockwise size={15}/><span>History</span></button><button onClick={()=>{navigate('library');setSavedOnly(true);}} disabled={busy}><BookmarkSimple size={15}/><span>Favorites</span></button><button onClick={()=>setSettings(true)}><GearSix size={15}/><span>Settings</span></button></div>
    </aside>
    <main className={`main-content page-${page}`}>
      <header className="topbar"><div className="topbar-left"><span className="toolbar-sidebar-toggle"><IconButton label="Open menu" onClick={toggleSidebar}><SidebarSimple size={17}/></IconButton></span><IconButton label="Back to home" onClick={()=>navigate('home')} disabled={busy||page==='home'}><ArrowLeft size={16}/></IconButton><IconButton label="View history" onClick={()=>{navigate('library');setSavedOnly(false);}} disabled={busy}><ClockCounterClockwise size={16}/></IconButton><span className="toolbar-divider"/><span className="toolbar-location">{page==='chat'?'Conversation':page==='discover'?'Discover':page==='library'?'Library':'New search'}</span></div>{page==='chat'&&current&&<nav className="chat-header-tabs" aria-label="Conversation views"><button aria-label="Answer" className={chatView==='answer'?'active':''} onClick={()=>setChatView('answer')}><Sparkle size={17}/>Answer</button><button className={chatView==='links'?'active':''} onClick={()=>setChatView('links')}><GlobeHemisphereWest size={17}/>Links</button></nav>}<div className="topbar-right"><IconButton label={theme==='light'?'Switch to dark theme':'Switch to light theme'} onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?<Moon size={16}/>:<Sun size={16}/>}</IconButton>{current&&page==='chat'&&<><IconButton label={current.saved?'Remove from saved':'Save conversation'} onClick={()=>toggleSave(current)}><BookmarkSimple size={16} weight={current.saved?'fill':'regular'}/></IconButton><IconButton label="Export conversation" onClick={()=>exportThread(current)}><DownloadSimple size={16}/></IconButton></>}{page==='chat'&&current&&<button className="share-thread" aria-label="Share conversation" title="Copy conversation to share" onClick={async()=>{await copy(current.messages.map(m=>(m.role==='user'?'You: ':'Perplemini: ')+m.content+(m.sources?.length?'\n\nSources:\n'+m.sources.map(source=>source.title+' — '+source.url).join('\n'):'')).join('\n\n'),'Conversation copied for sharing.');}}><ArrowUpRight size={16}/><span>Share</span></button>}<IconButton label="Workspace settings" onClick={()=>setSettings(true)}><GearSix size={16}/></IconButton></div></header>
      {page==='home'&&<div className="home-content"><div className="home-heading"><div className="home-mascot"><Mascot/></div><h1>What would you like to know?</h1></div><div className="home-composer">{composer}</div></div>}
      {page==='discover'&&<section className="content-page"><h1>Discover</h1><div className="discovery-grid">{discoveries.map(({title,description,tag,icon:I,tone,q})=><button className="discovery-card" key={tag} onClick={()=>submit(null,q)}><div className={`discovery-art ${tone}`}><I size={90} weight="thin"/><span className="art-orbit"/></div><div className="discovery-copy"><small>{tag}</small><h2>{title}</h2><p>{description}</p><span>Explore topic <ArrowUpRight size={17}/></span></div></button>)}</div></section>}
      {page==='library'&&<section className="content-page library-page"><h1>Library</h1><div className="library-toolbar"><div className="library-tabs"><button className={!savedOnly?'active':''} onClick={()=>setSavedOnly(false)}>All <small>{threads.length}</small></button><button className={savedOnly?'active':''} onClick={()=>setSavedOnly(true)}><BookmarkSimple size={15}/>Saved</button></div><label className="library-search"><MagnifyingGlass size={17}/><input placeholder="Search your library" aria-label="Search your library" value={libraryFilter} onChange={e=>setLibraryFilter(e.target.value)}/></label></div>{threads.filter(t=>(!savedOnly||t.saved)&&t.title.toLowerCase().includes(libraryFilter.toLowerCase())).map(t=><article className="library-item" key={t.id}><button onClick={()=>openThread(t.id)}><ChatCircle size={22}/><span><strong>{t.title}</strong><small>{new Date(t.updated).toLocaleDateString('en-US',{day:'numeric',month:'long'})} · {t.messages.filter(m=>m.role==='user').length} questions</small></span></button><IconButton label={t.saved?'Remove from saved':'Save conversation'} onClick={()=>toggleSave(t)}><BookmarkSimple size={18} weight={t.saved?'fill':'regular'}/></IconButton><IconButton label="Export conversation" onClick={()=>exportThread(t)}><DownloadSimple size={18}/></IconButton><IconButton label="Delete conversation" onClick={()=>setDeleteId(t.id)}><Trash size={18}/></IconButton></article>)}{!threads.filter(t=>(!savedOnly||t.saved)&&t.title.toLowerCase().includes(libraryFilter.toLowerCase())).length&&<div className="empty-state"><Books size={42} weight="thin"/><h2>{threads.length?'No conversations here':'No conversations yet'}</h2><p>{threads.length?'Try another filter or save a conversation.':'Your searches will be saved in this browser.'}</p><button className="primary-button" onClick={()=>navigate('home')}>Ask your first question <Plus size={17}/></button></div>}</section>}
      {page==='chat'&&current&&<ChatView thread={current} busy={busy} view={chatView} composer={composer} bottomRef={bottomRef} copy={copy} exportThread={exportThread} openSettings={()=>setSettings(true)} retry={question=>{setInput(question);inputRef.current?.focus();}}/>}
      {page!=='chat'&&page!=='home'&&<footer className="app-footer"><button onClick={()=>setSettings(true)}><Code size={14}/>Open source</button></footer>}
    </main>
    {notice&&<div className="toast" role="status"><Check size={18}/>{notice}</div>}
    {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e=>e.stopPropagation()}><div className="modal-heading"><span><GearSix size={22}/><h2 id="settings-title">Your Perplemini</h2></span><IconButton label="Close settings" onClick={()=>setSettings(false)}><X size={20}/></IconButton></div><CliSettings providers={status?.cliProviders} selected={cliProvider} selectedModels={cliModels} onSelect={selectCli} refresh={refreshStatus} checking={checkingCli} busy={busy}/><h3>Web search</h3><p className="cli-settings-description">The AI in your selected CLI decides what to search for, which pages to read and how to compare sources using its native web tools. There is no predefined search or required website. Tool availability depends on the CLI and its provider; search requirements are configured in that CLI.</p><div className="privacy-note"><Code size={23}/><p>History is stored in this browser. The selected CLI receives your question, context and sources, and uses its own account. Sessions may count toward the provider usage limits. Each request runs outside the project in a temporary directory.</p></div><div className="settings-links"><button onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?<Moon size={15}/>:<Sun size={15}/>}Change theme</button></div></section></div>}
    {deleteId&&<div className="modal-backdrop"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><Trash size={27}/><h2 id="delete-title">Delete this conversation?</h2><p>It will be deleted from this browser. You can export it before continuing.</p><div><button className="secondary-button" onClick={()=>setDeleteId(null)}>Cancel</button><button className="danger-button" onClick={()=>{setThreads(ts=>ts.filter(t=>t.id!==deleteId));if(active===deleteId){setActive(null);setPage('library');}setDeleteId(null);}}>Delete conversation</button></div></section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
