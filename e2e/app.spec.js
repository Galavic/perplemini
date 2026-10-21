import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/api/status',r=>r.fulfill({json:{available:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true,version:'0.160.1'},{id:'claude',name:'Claude Code',installed:true,version:'2.1.296'},{id:'opencode',name:'OpenCode',installed:true,version:'2.0.29'}],provider:'SearXNG',academic:true}}));});
test('search, citations, persistence, saved library and export',async({page})=>{
  await page.route('**/api/chat',r=>r.fulfill({contentType:'application/x-ndjson',body:[{type:'sources',provider:'SearXNG',sources:[{id:1,title:'Reference page',url:'https://example.org',domain:'example.org',content:'Research context'}]},{type:'token',text:'Esta es una respuesta verificada [1].'},{type:'done'}].map(JSON.stringify).join('\n')+'\n'}));
  await page.goto('/');await expect(page.getByRole('heading',{name:'What would you like to know?'})).toBeVisible();
  await page.getByRole('textbox',{name:'Your question'}).fill('¿Qué es la ciencia?');await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.locator('.markdown')).toContainText('respuesta verificada');await expect(page.locator('.citation')).toHaveAttribute('href','https://example.org');
  await page.getByRole('button',{name:'Save conversation'}).click();await page.getByRole('button',{name:'Library'}).click();await page.getByRole('button',{name:'Saved',exact:true}).click();await expect(page.locator('.library-item')).toHaveCount(1);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export conversation'}).click();expect((await download).suggestedFilename()).toMatch(/\.md$/);
  await page.reload();await page.getByRole('button',{name:'Library'}).click();await expect(page.locator('.library-item')).toHaveCount(1);
});
test('provider errors remain visible, sources remain usable',async({page})=>{
  await page.route('**/api/chat',r=>r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'error',message:'Model sin configurar'})+'\n'}));await page.goto('/');await page.getByRole('textbox',{name:'Your question'}).fill('Hola');await page.getByRole('button',{name:'Send question'}).click();await expect(page.getByRole('alert')).toContainText('Model sin configurar');await page.getByRole('button',{name:'Review settings'}).click();await expect(page.getByRole('dialog')).toBeVisible();
});
test('mobile layout, navigation, dark theme and settings',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('heading',{name:'What would you like to know?'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('button',{name:'Discover',exact:true}).click();await expect(page.locator('.discovery-card')).toHaveCount(4);await page.getByRole('button',{name:'Switch to dark theme'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:'test-results/discover-dark-mobile.png',fullPage:true,animations:'disabled'});
});
test('desktop visual check',async({page})=>{await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.screenshot({path:'test-results/desktop.png',fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});
