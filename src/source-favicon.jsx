import React, { useState } from 'react';
import { GlobeHemisphereWest } from './icons.jsx';

export function SourceFavicon({source,inline=false}){
  let origin='',hostname='';
  try{const url=new URL(source.url);if(['http:','https:'].includes(url.protocol)){origin=url.origin;hostname=url.hostname;}}catch{}
  const [failed,setFailed]=useState({origin:'',count:0});
  const attempt=failed.origin===origin?failed.count:0;
  const src=attempt===0?`${origin}/favicon.ico`:`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  return <span className={`source-avatar source-favicon${inline?' source-favicon-inline':''}`} aria-hidden="true">
    {origin&&attempt<2?<img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed({origin,count:attempt+1})}/>:<GlobeHemisphereWest size={inline?11:12}/>}
  </span>;
}
