// Keep Markdown's text nodes and whitespace intact; only decorate visible words.
export function streamWords(session){
  return ()=>tree=>{
    if(!session.live)return;
    const now=performance.now();let added=0;
    function walk(node){
      if(!node.children||['code','inlineCode','html'].includes(node.type))return;
      node.children=node.children.flatMap(child=>{
        if(child.type!=='text'){walk(child);return [child];}
        if(child.position?.start?.offset===undefined)return [child];
        return [...child.value.matchAll(/\S+|\s+/gu)].map(match=>{
          if(/^\s+$/u.test(match[0]))return {type:'text',value:match[0]};
          // The start offset stays the same when a CLI splits a word across chunks.
          const key=child.position.start.offset+match.index;
          let birth=session.words.get(key);
          if(!birth){birth={at:now,delay:Math.min(added++*30,120)};session.words.set(key,birth);}
          return {type:'streamWord',data:{hName:'span',hProperties:{className:'stream-word','data-stream-born':birth.at,'data-stream-delay':birth.delay}},children:[{type:'text',value:match[0]}]};
        });
      });
    }
    walk(tree);
  };
}
