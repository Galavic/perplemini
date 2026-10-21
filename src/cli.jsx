import React, {useId, useLayoutEffect, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import { Code, Check, ArrowClockwise, ArrowUpRight, Sparkle, Lightning, MagnifyingGlass, CaretDown, X } from './icons.jsx';
import './model-picker.css';

export const CLI_CHOICES = [
  { id: 'codex', name: 'Codex', loginCommand: 'codex login', docs: 'https://developers.openai.com/codex/cli/' },
  { id: 'claude', name: 'Claude Code', loginCommand: 'claude auth login', docs: 'https://code.claude.com/docs/en/quickstart' },
  { id: 'opencode', name: 'OpenCode', loginCommand: null, docs: 'https://opencode.ai/docs/' },
];

const providerIcons={codex:Code,claude:Sparkle,opencode:Lightning};
const fold=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function modelName(entry,cli){
  let name=entry.name||entry.id;
  if(name===entry.id){
    name=name.split('/').at(-1).replace(/^gpt-/i,'GPT\u0000').replace(/[-_]/g,' ').replace(/\b[a-z]/g,letter=>letter.toUpperCase()).replace('\u0000','-');
  }
  if(cli==='claude'&&!/^claude\b/i.test(name))name='Claude '+name;
  name=name.replace(/^(GPT-\d+(?:\.\d+)?)[ -](.+)$/i,(_match,prefix,suffix)=>prefix+' '+suffix.replace(/-/g,' '));
  return name;
}
function modelDetail(option){
  if(!option.model)return option.detail;
  const compact=text=>fold(text).replace(/[^a-z0-9]/g,'');
  const same=compact(option.name.replace(/^Claude /i,''))===compact(option.model.split('/').at(-1));
  return same&&(!option.model.includes('/')||option.model.startsWith(option.cli+'/'))?'':option.detail;
}

export function CliPicker({ providers, catalogs, value, model = '', onChange, disabled, loadingModels }) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[active,setActive]=useState(''),[position,setPosition]=useState(null);
  const triggerRef=useRef(null),popupRef=useRef(null),searchRef=useRef(null),id=useId();
  const selected=model?`${value}::${model}`:value;
  const groups=CLI_CHOICES.map(provider=>{
    const catalog=catalogs?.find(catalog=>catalog.id===provider.id),state=providers?.find(item=>item.id===provider.id);
    const entries=[...(catalog?.models||[])];
    if(provider.id===value&&model&&!entries.some(entry=>entry.id===model))entries.unshift({id:model,source:'saved'});
    const options=[{key:provider.id,cli:provider.id,model:'',name:'Default',detail:state?.model||`Uses the configuration of ${provider.name}`} ,...entries.map(entry=>({key:provider.id+'::'+entry.id,cli:provider.id,model:entry.id,name:modelName(entry,provider.id),detail:entry.id,source:entry.source}))].map(option=>({...option,disabled:Boolean(providers&&!state?.installed)}));
    return {...provider,error:catalog?.error,unavailable:Boolean(providers&&!state?.installed),options:options.filter(option=>!query.trim()||fold(provider.name+' '+option.name+' '+option.detail).includes(fold(query.trim())))};
  }).filter(group=>(filter==='all'||group.id===filter)&&group.options.length);
  const options=groups.flatMap(group=>group.options),enabled=options.filter(option=>!option.disabled);
  const currentProvider=CLI_CHOICES.find(provider=>provider.id===value)||CLI_CHOICES[0],Icon=providerIcons[currentProvider.id];
  const currentEntry=catalogs?.find(catalog=>catalog.id===value)?.models?.find(entry=>entry.id===model);
  const currentName=model?modelName(currentEntry||{id:model},value):'Model';
  const optionId=key=>`${id}-${encodeURIComponent(key)}`;
  function close(focus=false){setOpen(false);if(focus)triggerRef.current?.focus();}
  function choose(option){if(!option||option.disabled)return;onChange(option.cli,option.model);close(true);}
  function toggle(){if(open){close();return;}setQuery('');setFilter('all');setActive(selected);setOpen(true);}
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!popupRef.current?.contains(event.target)&&!triggerRef.current?.contains(event.target))close();};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const rect=triggerRef.current?.getBoundingClientRect();if(!rect)return;
      const above=rect.top>window.innerHeight-rect.bottom;
      const width=Math.min(356,window.innerWidth-24);
      setPosition({width,left:Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12)),maxHeight:Math.max(160,Math.min(510,(above?rect.top:window.innerHeight-rect.bottom)-20)),...(above?{bottom:window.innerHeight-rect.top+8}:{top:rect.bottom+8})});
    };
    place();
    window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open]);
  useLayoutEffect(()=>{if(open&&position)searchRef.current?.focus();},[open,position!==null]);
  function keyboard(event){
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close();triggerRef.current?.focus();return;}
    const index=enabled.findIndex(option=>option.key===active);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      if(['Home','End'].includes(event.key)&&event.target===searchRef.current)return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?enabled.length-1:event.key==='ArrowDown'?(index+1)%enabled.length:(index<=0?enabled.length:index)-1;
      const option=enabled[next];if(option){setActive(option.key);document.getElementById(optionId(option.key))?.focus({preventScroll:true});document.getElementById(optionId(option.key))?.scrollIntoView({block:'nearest'});}
    }
    if(event.key==='Enter'&&event.target===searchRef.current){event.preventDefault();choose(enabled.find(option=>option.key===active)||enabled[0]);}
  }
  return <div className="cli-picker">
    <button ref={triggerRef} className={`model-trigger ${open?'is-open':''}`} type="button" role="combobox" aria-label="CLI provider" aria-description={`${currentProvider.name} · ${model?currentName:'Default'}`} aria-expanded={open} aria-controls={open?`${id}-list`:undefined} aria-haspopup="listbox" title={`${currentProvider.name} · ${model?currentName:'Default'}`} disabled={disabled} onClick={toggle} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open)toggle();}}}>
      <Icon size={15}/><span className="model-trigger-name">{currentName}</span><span className="model-trigger-cli">{currentProvider.name}</span><CaretDown size={12}/>
    </button>
    {open&&createPortal(<div ref={popupRef} className="model-popover" style={position||{visibility:'hidden'}} onKeyDown={keyboard}>
      <div className="model-popover-heading"><span>Choose a model</span><button type="button" className="icon-button" aria-label="Close model picker" onClick={()=>close(true)}><X size={15}/></button></div>
      <label className="model-search"><MagnifyingGlass size={15}/><input ref={searchRef} type="search" aria-label="Search models" placeholder="Search models…" value={query} onChange={event=>{setQuery(event.target.value);setActive('');}}/></label>
      <div className="model-provider-filters" aria-label="Filter by CLI"><button type="button" aria-pressed={filter==='all'} onClick={()=>{setFilter('all');setActive('');}}>All</button>{CLI_CHOICES.map(provider=><button type="button" key={provider.id} aria-pressed={filter===provider.id} onClick={()=>{setFilter(provider.id);setActive('');}}>{provider.id==='claude'?'Claude':provider.name}</button>)}</div>
      <div className="model-options" role="listbox" id={`${id}-list`} aria-label="CLI and models">
        {groups.map(group=>{const Glyph=providerIcons[group.id];return <div role="group" aria-label={group.name} className="model-group" key={group.id}>
          <div className="model-group-heading"><span>{group.name}</span>{group.unavailable?<small>Not installed</small>:<small>CLI</small>}</div>
          {group.options.map(option=><button type="button" role="option" aria-label={`${group.name} · ${option.name}`} aria-selected={selected===option.key} aria-disabled={option.disabled} disabled={option.disabled} id={optionId(option.key)} tabIndex={-1} key={option.key} className={`model-option ${active===option.key?'is-active':''}`} title={option.model||option.detail} onFocus={()=>setActive(option.key)} onClick={()=>choose(option)}>
            <span className="model-option-icon"><Glyph size={17}/></span><span className="model-option-copy"><span className="model-option-name">{option.name}{option.source==='alias'&&<small>Alias</small>}{option.source==='saved'&&<small>Saved</small>}</span>{modelDetail(option)&&<span className="model-option-detail">{modelDetail(option)}</span>}</span>{selected===option.key&&<Check size={16} className="model-selected-check"/>}
          </button>)}
          {group.error&&<p className="model-catalog-error">The catalog could not be loaded. You can use the default model.</p>}
        </div>;})}
        {!options.length&&<div className="model-empty"><MagnifyingGlass size={22}/><p>No models match «{query}».</p><button type="button" onClick={()=>{setQuery('');setFilter('all');searchRef.current?.focus();}}>Clear search</button></div>}
      </div>
      <div className="model-popover-footer">{loadingModels?<span role="status">Loading catalog…</span>:<span>Models from your installed CLIs</span>}<span>Esc to close</span></div>
    </div>,document.body)}
  </div>;
}

export function CliSettings({ providers, selected, selectedModels = {}, onSelect, refresh, checking, busy }) {
  return <>
    <div className="cli-settings-heading"><h3>Answer provider</h3><button onClick={refresh} disabled={checking}><ArrowClockwise size={15}/>{checking?'Checking…':'Detect CLIs'}</button></div>
    <p className="cli-settings-description">Choose a tool installed on this computer. Each CLI uses its own configuration. OpenCode does not require a separate CLI login; requirements depend on the selected provider.</p>
    <div className="cli-settings-list">{CLI_CHOICES.map(choice=>{
      const state=providers?.find(p=>p.id===choice.id);
      return <section className={`cli-settings-item ${selected===choice.id?'cli-selected':''}`} key={choice.id}>
        <button className="cli-settings-choice" aria-pressed={selected===choice.id} disabled={!state?.installed||busy} onClick={()=>onSelect(choice.id)}><Code size={19}/><span><strong>{choice.name}</strong><small>{state?.installed?state.version:checking?'Checking installation…':'Not found in PATH'}</small></span>{selected===choice.id?<Check size={17}/>:<span className="cli-radio"/>}</button>
        <div className="cli-settings-meta"><span className={`status-dot ${state?.installed?'connected':''}`}/>{state?.installed?(choice.id==='opencode'?'Installed · uses the configured provider':'Installed · authentication managed by the CLI'):'Install it or set its path in .env'}</div>
        {choice.loginCommand?<code className="command">{choice.loginCommand}</code>:<p className="cli-settings-description">No required CLI login. Use the model configured in OpenCode or set <code>CLI_OPENCODE_MODEL</code>.</p>}
        <div className="cli-settings-detail"><span>{selectedModels[choice.id]||state?.model?`Model: ${selectedModels[choice.id]||state.model}`:'Default CLI model'}</span><a href={choice.docs} target="_blank" rel="noreferrer">Connection guide <ArrowUpRight size={13}/></a></div>
      </section>;
    })}</div><p className="cli-settings-description">The chat dropdown lets you choose a CLI and model. Catalogs may include models your account cannot access. Claude displays aliases; the version depends on the provider.</p>
  </>;
}
