import {test,expect} from '@playwright/test';
import http from 'node:http';

for(const reducedMotion of ['no-preference','reduce']){
  test(`new words reveal once without breaking Markdown (${reducedMotion})`,async({page})=>{
    let connection;
    const server=http.createServer(async(req,res)=>{
      res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type');
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      for await(const _ of req){}
      connection=res;res.setHeader('Content-Type','application/x-ndjson');res.flushHeaders();
      res.write(JSON.stringify({type:'token',text:'Una comput'})+'\n');
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      await page.emulateMedia({reducedMotion});
      await page.route('**/api/status',r=>r.fulfill({json:{available:true,cliProviders:[{id:'codex',name:'Codex',installed:true}]}}));
      await page.route('**/api/models',r=>r.fulfill({json:{providers:[]}}));
      await page.addInitScript(url=>{const fetch=window.fetch.bind(window);window.fetch=(input,options)=>fetch(input==='/api/chat'?url:input,options);},`http://127.0.0.1:${server.address().port}`);
      await page.goto('/');await page.getByLabel('Your question',{exact:true}).fill('Explica');await page.getByRole('button',{name:'Send question',exact:true}).click();
      const firstWord=page.locator('.stream-word').filter({hasText:/^Una$/});
      const partial=await page.locator('.stream-word').filter({hasText:/^comput$/}).elementHandle();
      await expect(firstWord).toBeVisible();
      if(reducedMotion==='reduce'){
        await expect(firstWord).toHaveCSS('filter','none');
        expect(await firstWord.evaluate(element=>element.getAnimations().length)).toBe(0);
      }else{
        const samples=await firstWord.evaluate(element=>{
          const animation=element.getAnimations()[0];animation.pause();const start=animation.effect.getTiming().delay;animation.currentTime=start;
          const from={filter:getComputedStyle(element).filter,opacity:getComputedStyle(element).opacity};
          animation.currentTime=start+120;
          const halfway={filter:getComputedStyle(element).filter,opacity:getComputedStyle(element).opacity};
          animation.finish();return {from,halfway};
        });
        expect(samples.from.filter).toBe('blur(4px)');expect(samples.from.opacity).toBe('0');
        expect(parseFloat(samples.halfway.opacity)).toBeGreaterThan(0.5);
        expect(samples.halfway.filter).not.toBe(samples.from.filter);
      }
      const send=event=>connection.write(JSON.stringify(event)+'\n');
      send({type:'sources',sources:[{id:1,title:'Referencia',url:'https://example.org/study',domain:'example.org'}]});
      send({type:'token',text:'ación **clara** con [1].\n\n- Primer punto\n\n`let value = 1`\n\n| A | B |\n| --- | --- |\n| Uno | Dos |'});
      await expect(page.locator('.markdown')).toContainText('computación');
      expect(await partial.evaluate(element=>element.isConnected&&element.textContent==='computación')).toBe(true);
      await expect(firstWord).toHaveCSS('opacity','1');
      await expect(page.locator('.markdown strong')).toHaveText('clara');
      await expect(page.locator('.markdown code')).toHaveText('let value = 1');
      await expect(page.locator('.markdown code .stream-word')).toHaveCount(0);
      await expect(page.locator('.markdown li')).toHaveText('Primer punto');
      await expect(page.locator('.markdown table tbody td')).toHaveCount(2);
      await expect(page.locator('.markdown .citation')).toHaveAttribute('href','https://example.org/study');
      connection.end(JSON.stringify({type:'done'})+'\n');
      await expect(page.locator('.markdown.is-streaming')).toHaveCount(0);
      await expect(firstWord).toHaveCSS('opacity','1');
      await expect(firstWord).toHaveCSS('filter','none');
      await page.getByRole('button',{name:'New search'}).click();
      await page.locator('.history-item').first().click();
      await expect(page.locator('.markdown')).toContainText('computación');
      await expect(page.locator('.markdown .stream-word')).toHaveCount(0);
    }finally{connection?.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
}

test('partial text appears before completion and scrolling up suspends automatic following',async({page})=>{
  let connection;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','content-type');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    for await(const _ of req){}
    connection=res;res.setHeader('Content-Type','application/x-ndjson');res.flushHeaders();
    res.write(JSON.stringify({type:'token',text:'Primera parte visible.\n\n'+Array.from({length:45},(_,i)=>`Párrafo ${i+1} de la respuesta que se está generando.\n\n`).join('')})+'\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/stream`;
  try{
    await page.setViewportSize({width:1440,height:900});
    await page.route('**/api/status',route=>route.fulfill({json:{available:true,academic:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true}]}}));
    await page.route('**/api/models',route=>route.fulfill({json:{providers:[]}}));
    await page.addInitScript(url=>{
      const original=window.fetch.bind(window);
      window.fetch=(input,options)=>original(input==='/api/chat'?url:input,options);
    },url);
    await page.goto('/');
    await page.getByLabel('Your question',{exact:true}).fill('Una respuesta en streaming');
    await page.getByRole('button',{name:'Send question',exact:true}).click();
    await expect(page.locator('.markdown.is-streaming')).toContainText('Primera parte visible.');
    await expect(page.getByRole('button',{name:'Stop response'})).toBeVisible();
    const scrollTop=()=>page.locator('.conversation').evaluate(element=>element.scrollTop);
    await expect.poll(scrollTop).toBeGreaterThan(200);
    await page.locator('.conversation').evaluate(element=>{element.scrollTop=0;element.dispatchEvent(new Event('scroll'));});
    connection.write(JSON.stringify({type:'token',text:'Otro fragmento recibido mientras lees arriba.\n\n'})+'\n');
    await expect(page.locator('.markdown')).toContainText('Otro fragmento recibido');
    await expect.poll(scrollTop).toBe(0);
    connection.end(JSON.stringify({type:'token',text:'Fin de la respuesta.'})+'\n'+JSON.stringify({type:'done'})+'\n');
    await expect(page.locator('.markdown')).toContainText('Fin de la respuesta.');
    await expect(page.locator('.markdown.is-streaming')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Stop response'})).toHaveCount(0);
  }finally{
    connection?.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
