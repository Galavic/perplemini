import {useEffect} from 'react';
import {OverlayScrollbars,ClickScrollPlugin} from 'overlayscrollbars';
import 'overlayscrollbars/overlayscrollbars.css';
import './scrollbars.css';

const selector='.history-list,.conversation,.sources-panel-body,.main-content,.model-options,.settings-modal';
OverlayScrollbars.plugin(ClickScrollPlugin);

export function useAppScrollbars(){
  useEffect(()=>{
    const instances=new Map();
    function attach(element){
      if(instances.has(element))return;
      // Reuse the existing scroll element so refs, scrollTop and React children stay intact.
      const instance=OverlayScrollbars({target:element,elements:{viewport:element}}, {
        overflow:{x:'hidden',y:'scroll'},
        scrollbars:{theme:'os-theme-perplemini',autoHide:'leave',autoHideDelay:650,dragScroll:true,clickScroll:true},
      });
      instances.set(element,instance);
    }
    function discover(node){
      if(!(node instanceof Element))return;
      if(node.matches(selector))attach(node);
      if(node.childElementCount)node.querySelectorAll(selector).forEach(attach);
    }
    discover(document.body);
    const observer=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)discover(node);
      for(const [element,instance] of instances)if(!element.isConnected){instance.destroy();instances.delete(element);}
    });
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();instances.forEach(instance=>instance.destroy());};
  },[]);
}
