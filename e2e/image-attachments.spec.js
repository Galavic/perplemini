import {test,expect} from '@playwright/test';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC','base64');

test('multiple photos accumulate as small squares and can be removed individually',async({page})=>{
  let sent;
  await page.setViewportSize({width:390,height:760});
  await page.route('**/api/status',r=>r.fulfill({json:{available:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true}]}}));
  await page.route('**/api/models',r=>r.fulfill({json:{providers:[]}}));
  await page.route('**/api/chat',r=>{sent=r.request().postDataJSON();return r.fulfill({contentType:'application/x-ndjson',body:'{"type":"token","text":"Fotos recibidas."}\n{"type":"done"}\n'});});
  await page.goto('/');
  const picker=page.locator('input[type=file]');
  await expect(picker).toHaveAttribute('multiple','');
  const photo=name=>({name,mimeType:'image/png',buffer:png});
  await picker.setInputFiles([photo('uno.png'),photo('dos.png')]);
  await expect(page.locator('.image-attachment')).toHaveCount(2);
  await picker.setInputFiles([photo('tres.png')]);
  await expect(page.locator('.image-attachment')).toHaveCount(3);
  for(const thumbnail of await page.locator('.image-attachment').all()){
    const box=await thumbnail.boundingBox();expect(box.width).toBe(64);expect(box.height).toBe(64);
    const image=await thumbnail.locator('img').boundingBox();expect(image.width).toBe(image.height);
  }
  await page.getByRole('button',{name:'Remove attachment dos.png',exact:true}).click();
  await expect(page.locator('.image-attachment')).toHaveCount(2);
  await expect(page.getByAltText('Preview: uno.png')).toBeVisible();
  await expect(page.getByAltText('Preview: tres.png')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/multiple-photo-squares.png'});
  await page.getByRole('button',{name:'Send question',exact:true}).click();
  await expect(page.locator('.markdown')).toContainText('Fotos recibidas.');
  expect(sent.images.map(image=>image.name)).toEqual(['uno.png','tres.png']);
  expect(sent.messages.at(-1).content).toBe('Describe these images.');
  await expect(page.locator('.user-images img')).toHaveCount(2);
});

test('attach, preview, remove and send an image without a typed prompt',async({page})=>{
  let sent;
  await page.route('**/api/status',r=>r.fulfill({json:{available:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true}]}}));
  await page.route('**/api/models',r=>r.fulfill({json:{providers:[]}}));
  await page.route('**/api/chat',r=>{sent=r.request().postDataJSON();return r.fulfill({contentType:'application/x-ndjson',body:'{"type":"token","text":"Imagen recibida."}\n{"type":"done"}\n'});});
  await page.goto('/');
  const input=page.locator('input[type=file]');
  expect(await input.getAttribute('accept')).toContain('.png');
  await input.setInputFiles({name:'captura.png',mimeType:'image/png',buffer:png});
  await expect(page.getByAltText('Preview: captura.png')).toBeVisible();
  await page.getByRole('button',{name:'Remove attachment captura.png'}).click();
  await expect(page.locator('.attachment')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Send question',exact:true})).toBeDisabled();
  await input.setInputFiles({name:'captura.png',mimeType:'image/png',buffer:png});
  await expect(page.getByRole('button',{name:'Send question',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Send question',exact:true}).click();
  await expect(page.locator('.markdown')).toContainText('Imagen recibida.');
  expect(sent.images).toEqual([{name:'captura.png',mime:'image/png',data:png.toString('base64')}]);
  expect(sent.messages.at(-1).content).toBe('Describe this image.');
  expect(sent.attachment).toBe('');
  await expect(page.locator('.user-image')).toBeVisible();
  await expect(page.locator('.user-image')).toHaveAttribute('alt','captura.png');
});

test('pasted images are attached and oversized images show a useful error',async({page})=>{
  await page.route('**/api/status',r=>r.fulfill({json:{available:true,cliProviders:[]}}));
  await page.route('**/api/models',r=>r.fulfill({json:{providers:[]}}));
  await page.goto('/');
  await page.getByLabel('Your question',{exact:true}).evaluate((element,base64)=>{
    const file=new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'pegada.png',{type:'image/png'});
    const data=new DataTransfer();data.items.add(file);
    element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  },png.toString('base64'));
  await expect(page.getByAltText('Preview: pegada.png')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'grande.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});
  await expect(page.getByText('Images must be 5 MB or smaller.')).toBeVisible();
  await expect(page.getByAltText('Preview: pegada.png')).toBeVisible();
});
