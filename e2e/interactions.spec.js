import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/api/status',r=>r.fulfill({json:{available:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true,version:'0.160.1'},{id:'claude',name:'Claude Code',installed:true,version:'2.1.296'},{id:'opencode',name:'OpenCode',installed:true,version:'2.0.29'}],provider:'SearXNG',academic:true}}));});
test('text attachment and writing mode reach the backend; deletion is persisted',async({page})=>{
  let request;
  await page.route('**/api/chat',async r=>{request=r.request().postDataJSON();await r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'token',text:'Resumen del archivo.'})+'\n'+JSON.stringify({type:'done'})+'\n'});});
  await page.goto('/');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:/Write Write/}).click();
  await page.locator('input[type=file]').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Contenido real del archivo')});
  await expect(page.locator('.attachment')).toContainText('notes.txt');await page.getByRole('textbox',{name:'Your question'}).fill('Resume este texto');await page.getByRole('button',{name:'Send question'}).click();await expect(page.locator('.markdown')).toContainText('Resumen');expect(request.mode).toBe('writing');expect(request.attachment).toBe('Contenido real del archivo');
  await page.getByRole('button',{name:'Library'}).click();await page.getByRole('button',{name:'Delete conversation'}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.library-item')).toHaveCount(1);await page.getByRole('button',{name:'Delete conversation'}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete conversation'}).click();await expect(page.locator('.library-item')).toHaveCount(0);await page.reload();await page.getByRole('button',{name:'Library'}).click();await expect(page.locator('.library-item')).toHaveCount(0);
});
test('stop aborts a pending query and allows another submission',async({page})=>{
  await page.route('**/api/chat',async r=>{await new Promise(resolve=>setTimeout(resolve,800));try{await r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'done'})+'\n'});}catch{}});
  await page.goto('/');await page.getByRole('textbox',{name:'Your question'}).fill('Una pregunta');await page.getByRole('button',{name:'Send question'}).click();await page.getByRole('button',{name:'Stop response'}).click();await expect(page.getByRole('alert')).toContainText('Response stopped');await expect(page.getByRole('textbox',{name:'Your question'})).toBeEnabled();
});
