import {test,expect} from '@playwright/test';
import http from 'node:http';

test('research has one shimmer label, a real timer and a reduced motion fallback',async({page})=>{
  let connection;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    for await(const _ of req){}
    connection=res;res.setHeader('Content-Type','application/x-ndjson');
    res.write(JSON.stringify({type:'status',text:'Buscando: una consulta que no debe duplicar el indicador'})+'\n');
    res.write(JSON.stringify({type:'research',steps:[{action:'search',detail:'Una consulta real'}],searched:true,opened:false,completed:false})+'\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await page.setViewportSize({width:1440,height:900});
    await page.route('**/api/status',route=>route.fulfill({json:{available:true,academic:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true}]}}));
    await page.route('**/api/models',route=>route.fulfill({json:{providers:[]}}));
    await page.addInitScript(url=>{
      const original=window.fetch.bind(window);window.fetch=(input,options)=>original(input==='/api/chat'?url:input,options);
    },`http://127.0.0.1:${server.address().port}/stream`);
    await page.goto('/');await page.getByRole('button',{name:'Switch to dark theme'}).click();
    await page.getByLabel('Your question',{exact:true}).fill('¿Qué es una célula madre?');
    await page.getByRole('button',{name:'Send question'}).click();
    const indicator=page.locator('.research-shimmer');
    await expect(page.getByRole('status',{name:'Researching',exact:true})).toBeVisible();
    await expect(indicator).toHaveText(/^Researching \d+s$/);
    await expect(indicator).toHaveCSS('animation-name','research-shine');
    await expect(indicator).toHaveCSS('font-size','14px');
    await expect(page.locator('.answer [role="status"]')).toHaveCount(1);
    await expect(page.locator('.answer svg')).toHaveCount(0);
    await expect(page.locator('.loading-answer, .loading-dots, .research-activity')).toHaveCount(0);
    await expect(indicator).toHaveText(/^Researching [1-9]\d*s$/,{timeout:3500});
    async function frame(time){
      await indicator.evaluate(async(element,time)=>{
        const animation=element.getAnimations()[0];await animation.ready;animation.pause();await animation.ready;animation.currentTime=time;
        getComputedStyle(element).backgroundPosition;
      },time);
      return indicator.screenshot({animations:'allow'});
    }
    const start=await frame(0),middle=await frame(800);
    expect(start.equals(middle),'the shine must visibly change the text pixels').toBe(false);
    await page.locator('.conversation').screenshot({path:'test-results/research-shimmer-dark.png',animations:'allow'});
    await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();
    const lightStart=await frame(0),lightMiddle=await frame(800);
    expect(lightStart.equals(lightMiddle),'the shine must also be visible on a white background').toBe(false);
    await page.locator('.conversation').screenshot({path:'test-results/research-shimmer-light.png',animations:'allow'});
    await page.emulateMedia({reducedMotion:'reduce'});
    await expect(indicator).toHaveCSS('animation-name','none');
    await expect(indicator).toHaveCSS('background-image','none');
    connection.end(JSON.stringify({type:'token',text:'Una célula madre puede originar distintos tipos de células.'})+'\n'+JSON.stringify({type:'done'})+'\n');
    await expect(page.locator('.markdown')).toContainText('Una célula madre');
    await expect(indicator).toHaveCount(0);
    await expect(page.locator('.research-activity')).toBeVisible();
  }finally{connection?.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
