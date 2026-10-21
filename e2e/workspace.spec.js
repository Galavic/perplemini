import {test,expect} from '@playwright/test';

test('workspace sidebar can collapse and reopen without losing navigation',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.route('**/api/status',r=>r.fulfill({json:{available:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true,version:'0.160.1'},{id:'claude',name:'Claude Code',installed:true,version:'2.1.296'},{id:'opencode',name:'OpenCode',installed:true,version:'2.0.29'}],provider:'SearXNG',academic:true}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Hide sidebar'}).click();
  await expect(page.locator('.main-content')).toHaveCSS('margin-left','0px');
  await page.getByRole('button',{name:'Open menu'}).click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button',{name:'Discover',exact:true}).click();
  await page.getByRole('button',{name:'Back to home',exact:true}).click();
  await expect(page.getByRole('heading',{name:'What would you like to know?'})).toBeVisible();
});

test('conversation fits the new workspace and dark palette',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.route('**/api/status',r=>r.fulfill({json:{available:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true,version:'0.160.1'},{id:'claude',name:'Claude Code',installed:true,version:'2.1.296'},{id:'opencode',name:'OpenCode',installed:true,version:'2.0.29'}],provider:'SearXNG',academic:true}}));
  await page.route('**/api/chat',r=>r.fulfill({contentType:'application/x-ndjson',body:[{type:'sources',provider:'SearXNG',sources:[{id:1,title:'Una referencia para seguir explorando',url:'https://example.org',domain:'example.org',content:'Contexto of research.'}]},{type:'token',text:'## Una idea compartida\n\nEl software de código abierto permite estudiar, modificar y compartir su código source según los términos de su licencia. [1]\n\nPuedes empezar por leer la documentación de un proyecto y elegir una contribución pequeña.'},{type:'done'}].map(JSON.stringify).join('\n')+'\n'}));
  await page.goto('/');
  await page.getByRole('textbox',{name:'Your question'}).fill('¿Qué significa que un proyecto sea de código abierto?');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.locator('.markdown')).toContainText('Una idea compartida');
  await page.screenshot({path:'test-results/conversation.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Switch to dark theme'}).click();
  await page.screenshot({path:'test-results/conversation-dark.png',fullPage:true,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
