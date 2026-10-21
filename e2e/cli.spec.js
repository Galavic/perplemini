import {test,expect} from '@playwright/test';
const providers=[{id:'codex',name:'Codex',installed:true,version:'0.160.1'},{id:'claude',name:'Claude Code',installed:true,version:'2.1.296'},{id:'opencode',name:'OpenCode',installed:false,version:''}];
test.beforeEach(async({page})=>{
  await page.route('**/api/status',r=>r.fulfill({json:{available:true,defaultCli:'codex',cliProviders:providers,provider:'Wikipedia',academic:false}}));
  await page.route('**/api/models',r=>r.fulfill({json:{providers:[{id:'codex',models:[{id:'test-codex',name:'Test Codex',source:'cli'}]},{id:'claude',models:[{id:'sonnet',name:'Sonnet',source:'alias'}]},{id:'opencode',models:[]}]}}));
});
test('CLI selection persists, reaches backend and labels answers',async({page})=>{
  let captured;
  await page.route('**/api/chat',r=>{captured=r.request().postDataJSON();return r.fulfill({contentType:'application/x-ndjson',body:[{type:'cli',id:'claude',name:'Claude Code',model:'configured-model'},{type:'token',text:'Answer desde Claude Code.'},{type:'done'}].map(JSON.stringify).join('\n')+'\n'});});
  await page.goto('/');await page.getByRole('combobox',{name:'CLI provider'}).click();await page.getByRole('option',{name:'Claude Code · Default',exact:true}).click();await page.reload();await expect(page.getByRole('combobox',{name:'CLI provider'})).toHaveAttribute('aria-description',/Claude Code · Default/);
  await page.getByRole('textbox',{name:'Your question'}).fill('Una pregunta con sources');await page.getByRole('button',{name:'Send question'}).click();await expect(page.locator('.markdown')).toContainText('Answer desde Claude Code');expect(captured.cliProvider).toBe('claude');await expect(page.locator('.answer-actions')).toContainText('Claude Code');await expect(page.locator('.answer-actions')).toContainText('configured-model');
});
test('settings distinguish installation from authentication and show login commands',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Workspace settings'}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('.cli-settings-item')).toHaveCount(3);await expect(dialog).toContainText('claude auth login');await expect(dialog).toContainText('codex login');await expect(dialog).toContainText('Not found in PATH');await expect(dialog.locator('.cli-settings-choice').nth(2)).toBeDisabled();await expect(dialog).not.toContainText('Ollama');
  await dialog.locator('.cli-settings-choice').nth(1).click();await page.getByRole('button',{name:'Close settings'}).click();await expect(page.getByRole('combobox',{name:'CLI provider'})).toHaveAttribute('aria-description',/Claude Code/);
});
test('OpenCode settings do not require CLI login',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Workspace settings'}).click();
  const opencode=page.locator('.cli-settings-item').nth(2);
  await expect(opencode).toContainText('No required CLI login');
  await expect(opencode).not.toContainText('opencode auth login');
});
test('grouped dropdown lists CLI models and remembers the selected model',async({page})=>{
  let captured;
  await page.route('**/api/chat',r=>{captured=r.request().postDataJSON();return r.fulfill({contentType:'application/x-ndjson',body:[{type:'cli',id:'claude',name:'Claude Code',model:'sonnet'},{type:'token',text:'Selected model answer.'},{type:'done'}].map(JSON.stringify).join('\n')+'\n'});});
  await page.goto('/');const select=page.getByRole('combobox',{name:'CLI provider'});
  await select.click();
  await expect(page.getByRole('listbox').getByRole('group')).toHaveCount(3);
  await expect(page.getByRole('group',{name:'Claude Code',exact:true})).toContainText('Claude Sonnet');
  await page.getByRole('option',{name:'Claude Code · Claude Sonnet',exact:true}).click();await page.reload();await expect(select).toHaveAttribute('aria-description','Claude Code · Claude Sonnet');
  await page.getByRole('textbox',{name:'Your question'}).fill('Question');await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.locator('.markdown')).toContainText('Selected model answer');expect(captured.cliProvider).toBe('claude');expect(captured.cliModel).toBe('sonnet');
  await expect(page.locator('.answer-actions')).toContainText('sonnet');
});

test('model search, provider filters, unavailable CLI and keyboard selection work',async({page})=>{
  await page.goto('/');const picker=page.getByRole('combobox',{name:'CLI provider'});
  await picker.click();await expect(page.getByRole('searchbox',{name:'Search models'})).toBeFocused();
  await expect(page.getByRole('option',{name:'OpenCode · Default',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Claude',exact:true}).click();
  await expect(page.getByRole('listbox').getByRole('group')).toHaveCount(1);
  await page.getByRole('searchbox',{name:'Search models'}).fill('sonnet');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.getByRole('searchbox',{name:'Search models'}).press('ArrowDown');
  await expect(page.getByRole('option',{name:'Claude Code · Claude Sonnet',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');await expect(picker).toHaveAttribute('aria-expanded','false');
  await expect(picker).toContainText('Claude Sonnet');await expect(picker).toBeFocused();
  await picker.click();await expect(page.getByRole('option',{name:'Claude Code · Claude Sonnet',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('searchbox',{name:'Search models'}).fill('no-such-model');await expect(page.getByText('No models match', {exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Clear search'}).click();await expect(page.getByRole('option')).toHaveCount(5);
  await page.keyboard.press('Escape');await expect(picker).toBeFocused();await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('model menu fits narrow screens, supports dark mode and closes on outside click',async({page})=>{
  await page.setViewportSize({width:360,height:800});await page.goto('/');
  await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();
  await page.getByRole('combobox',{name:'CLI provider'}).click();
  const popup=page.locator('.model-popover');await expect(popup).toBeVisible();
  const bounds=await popup.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(360);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(800);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/model-picker-mobile.png',fullPage:true,animations:'disabled'});
  await page.mouse.click(5,5);await expect(popup).toHaveCount(0);
});
test('CLI selector and controls fit narrow screens',async({page})=>{
  await page.setViewportSize({width:360,height:800});await page.goto('/');const picker=page.getByRole('combobox',{name:'CLI provider'});await expect(picker).toBeVisible();const bounds=await picker.boundingBox();expect(bounds.x+bounds.width).toBeLessThanOrEqual(360);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/cli-mobile.png',fullPage:true,animations:'disabled'});
});
