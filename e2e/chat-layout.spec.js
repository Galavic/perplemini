import { test, expect } from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/api/status',route=>route.fulfill({json:{available:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true}],provider:'SearXNG',academic:true}}));
  await page.route('**/api/models',route=>route.fulfill({json:{providers:[]}}));
  let turn=0;
  await page.route('**/api/chat',route=>{
    turn++;
    return route.fulfill({contentType:'application/x-ndjson',body:[
      {type:'sources',provider:'SearXNG',sources:[{id:1,title:`Referencia del turno ${turn}`,url:`https://example.org/turn-${turn}`,domain:'example.org',content:'Contexto y detalles de la source consultada.'}]},
      {type:'token',text:`Answer del turno ${turn} con una referencia [1].`},
      {type:'done'},
    ].map(JSON.stringify).join('\n')+'\n'});
  });
});

async function ask(page,question){
  await page.getByRole('textbox',{name:'Your question'}).fill(question);
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.getByRole('button',{name:'Stop response'})).toHaveCount(0);
}

test('conversation bubbles, per-turn citations, links view and sharing work together',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.sharedConversation=text;}}}));
  await page.goto('/');
  await ask(page,'Primera pregunta');
  await expect(page.locator('.markdown')).toContainText('Answer del turno 1');
  await ask(page,'Pregunta de seguimiento');
  await expect(page.locator('.user-bubble')).toHaveCount(2);
  await expect(page.locator('.sources-panel')).toContainText('Referencia del turno 2');
  await page.locator('.citation').first().click();
  await expect(page.locator('.sources-panel .source-entry.is-selected')).toContainText('Referencia del turno 1');
  const conversation=await page.locator('.chat-column').boundingBox();
  const sources=await page.locator('.sources-panel').boundingBox();
  expect(sources.x).toBeGreaterThan(conversation.x+conversation.width);
  await page.getByRole('button',{name:'Links',exact:true}).click();
  await expect(page.locator('.links-turn')).toHaveCount(2);
  await expect(page.locator('.links-content .source-entry')).toHaveCount(2);
  await page.getByRole('button',{name:'Answer',exact:true}).click();
  await expect(page.locator('.user-bubble')).toHaveCount(2);
  await page.getByRole('button',{name:'Share conversation',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.sharedConversation)).toContain('https://example.org/turn-2');
  await expect(page.getByRole('status')).toContainText('Conversation copied');
});

test('mobile citations open a source drawer and composer controls remain accessible',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/');
  await ask(page,'Una pregunta desde el móvil');
  await expect(page.locator('.markdown')).toContainText('Answer del turno 1');
  await expect(page.locator('.sources-panel')).toBeHidden();
  await page.locator('.citation').click();
  await expect(page.locator('.sources-panel')).toBeVisible();
  await expect(page.locator('.source-entry.is-selected')).toHaveAttribute('href','https://example.org/turn-1');
  await page.getByRole('button',{name:'Close sources'}).click();
  await expect(page.locator('.sources-panel')).toBeHidden();
  const controls=await Promise.all(['Attach images or files','CLI provider','Send question'].map(name=>page.getByLabel(name,{exact:true}).boundingBox()));
  controls.forEach(box=>{expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(360);});
  expect(controls[1].x+controls[1].width).toBeLessThan(controls[2].x);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/chat-mobile.png',fullPage:true,animations:'disabled'});
});

test('native CLI activity, late sources and corrected final citations persist in a thread',async({page})=>{
  await page.route('**/api/chat',route=>route.fulfill({contentType:'application/x-ndjson',body:[
    {type:'research',steps:[{action:'search',detail:'consulta elegida por la IA'},{action:'read',detail:'https://example.org/research'}],searched:true,opened:true,completed:false},
    {type:'token',text:'Un hecho verificado. citeturn0search0'},
    {type:'sources',provider:'Codex · web nativa',sources:[{id:1,title:'Fuente consultada por la IA',domain:'example.org',url:'https://example.org/research',content:'Evidencia de la página.'}]},
    {type:'answer',text:'Un hecho verificado. [Fuente consultada por la IA](https://example.org/research)'},
    {type:'research',steps:[{action:'search',detail:'consulta elegida por la IA'},{action:'read',detail:'https://example.org/research'}],searched:true,opened:true,completed:true},
    {type:'done'},
  ].map(JSON.stringify).join('\n')+'\n'}));
  await page.goto('/');
  await ask(page,'Investiga esta pregunta');
  await expect(page.locator('.markdown .citation')).toHaveText('example.org');
  await expect(page.locator('.markdown')).not.toContainText('turn0search0');
  await page.getByText('2 research steps',{exact:true}).click();
  await expect(page.locator('.research-activity')).toContainText('consulta elegida por la IA');
  await page.reload();
  await page.locator('.history-item').first().click();
  await expect(page.getByText('2 research steps',{exact:true})).toBeVisible();
  await expect(page.locator('.markdown .citation')).toHaveAttribute('href','https://example.org/research');
});
