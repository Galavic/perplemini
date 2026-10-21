import {test,expect} from '@playwright/test';
import http from 'node:http';

test('the floating frame and conversation stay fixed when sources arrive and grow',async({page})=>{
  let connection;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    for await(const _ of req){}
    connection=res;res.setHeader('Content-Type','application/x-ndjson');res.flushHeaders();
    res.write(JSON.stringify({type:'status',text:'Researching'})+'\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const send=event=>connection.write(JSON.stringify(event)+'\n');
  try{
    await page.setViewportSize({width:1920,height:950});
    await page.route('**/api/status',route=>route.fulfill({json:{available:true,academic:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true}]}}));
    await page.route('**/api/models',route=>route.fulfill({json:{providers:[]}}));
    await page.addInitScript(url=>{
      const original=window.fetch.bind(window);window.fetch=(input,options)=>original(input==='/api/chat'?url:input,options);
      localStorage.setItem('perplemini.threads',JSON.stringify(Array.from({length:20},(_,i)=>({id:`history-${i}`,title:`Conversation guardada ${i+1}`,updated:Date.now(),messages:[]}))));
    },`http://127.0.0.1:${server.address().port}/stream`);
    await page.goto('/');
    const main=page.locator('.main-content'),sidebar=page.locator('.sidebar');
    const initialMain=await main.boundingBox(),initialSidebar=await sidebar.boundingBox();
    const radius=await main.evaluate(element=>getComputedStyle(element).borderRadius);
    await page.getByLabel('Your question',{exact:true}).fill('¿Qué es una célula madre?');
    await page.getByRole('button',{name:'Send question'}).click();
    await expect(page.getByRole('status',{name:'Researching',exact:true})).toBeVisible();
    expect(await main.boundingBox()).toEqual(initialMain);expect(await sidebar.boundingBox()).toEqual(initialSidebar);
    await expect(main).toHaveCSS('border-radius',radius);
    await page.locator('.composer-followup').evaluate(element=>Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished)));
    const elements=['.conversation','.user-bubble','.composer-followup'];
    const before=await Promise.all(elements.map(selector=>page.locator(selector).boundingBox()));
    const workspace=await page.locator('.chat-layout').boundingBox();
    const scrollViewport=await page.locator('.conversation').boundingBox();
    expect(Math.abs(scrollViewport.x+scrollViewport.width-workspace.x-workspace.width)).toBeLessThan(1);
    const centeredColumn=await page.locator('.chat-column').boundingBox();
    const answerBounds=await page.locator('.answer').boundingBox();
    expect(Math.abs(answerBounds.x+answerBounds.width/2-workspace.x-workspace.width/2)).toBeLessThan(1);
    expect(Math.abs(centeredColumn.x+centeredColumn.width/2-workspace.x-workspace.width/2)).toBeLessThan(1);
    await expect(page.locator('.sources-panel')).toBeHidden();
    const sources=Array.from({length:12},(_,i)=>({id:i+1,title:`Fuente científica ${i+1}`,domain:`source${i+1}.example`,url:`https://source${i+1}.example/article`,content:'Contexto de la publicación científica y resumen de los hallazgos. '.repeat(8)}));
    send({type:'sources',provider:'Codex · web nativa',sources:sources.slice(0,1)});
    await expect(page.locator('.sources-panel')).toBeVisible();
    send({type:'sources',provider:'Codex · web nativa',sources});
    await expect(page.locator('.sources-panel .source-entry')).toHaveCount(12);
    const sourcesBounds=await page.locator('.sources-panel').boundingBox();
    expect(Math.abs(workspace.x+workspace.width-sourcesBounds.x-sourcesBounds.width-20)).toBeLessThan(1);
    expect(sourcesBounds.x-centeredColumn.x-centeredColumn.width).toBeGreaterThanOrEqual(20);
    const after=await Promise.all(elements.map(selector=>page.locator(selector).boundingBox()));
    expect(after).toEqual(before);
    expect(await page.locator('.conversation').evaluate(element=>element.scrollTop)).toBe(0);
    expect(await main.evaluate(element=>element.scrollTop)).toBe(0);
    expect(await page.locator('.sources-panel-body').evaluate(element=>element.scrollHeight>element.clientHeight)).toBe(true);
    await page.locator('.history-list').hover();
    expect(await page.locator('.history-list').evaluate(element=>getComputedStyle(element,'::-webkit-scrollbar-button').display)).toBe('none');
    await page.screenshot({path:'test-results/stable-research-sources.png',animations:'disabled'});
    await page.getByRole('button',{name:'Links',exact:true}).click();
    await expect(page.locator('.links-content .source-entry')).toHaveCount(12);
    expect(await page.locator('.conversation').evaluate(element=>element.scrollTop)).toBe(0);
    await page.getByRole('button',{name:'Answer',exact:true}).click();
    connection.end(JSON.stringify({type:'token',text:'Una célula madre puede originar distintos tipos de células. [1]'})+'\n'+JSON.stringify({type:'done'})+'\n');
    await expect(page.getByRole('button',{name:'Stop response'})).toHaveCount(0);
    const composer=await page.locator('.composer-followup').boundingBox();
    await page.getByRole('button',{name:'Links',exact:true}).click();
    await expect(page.locator('.sources-panel')).toBeHidden();
    await expect(page.locator('.links-content .source-entry')).toHaveCount(12);
    expect(await page.locator('.composer-followup').boundingBox()).toEqual(composer);
    expect(Math.abs(composer.x+composer.width/2-workspace.x-workspace.width/2)).toBeLessThan(1);
    expect(await main.boundingBox()).toEqual(initialMain);
    await page.screenshot({path:'test-results/stable-links-workspace.png',animations:'disabled'});
    await page.setViewportSize({width:390,height:680});
    const frame=await main.boundingBox(),input=await page.locator('.composer-followup').boundingBox();
    expect(input.y+input.height).toBeLessThan(frame.y+frame.height);
    await expect(main).toHaveCSS('border-radius','13px');
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{connection?.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
