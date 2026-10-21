import {test,expect} from '@playwright/test';

async function prepare(page){
  await page.route('**/api/status',route=>route.fulfill({json:{available:true,defaultCli:'codex',cliProviders:[{id:'codex',name:'Codex',installed:true}]}}));
  await page.route('**/api/models',route=>route.fulfill({json:{providers:[]}}));
  await page.route('**/api/chat',route=>route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'token',text:'Answer de prueba.'})+'\n'+JSON.stringify({type:'done'})+'\n'}));
  await page.addInitScript(()=>{
    const animate=Element.prototype.animate;
    Element.prototype.animate=function(...args){
      const animation=animate.apply(this,args);
      if(this.matches('.composer-followup')){animation.pause();animation.currentTime=0;}
      return animation;
    };
  });
  await page.goto('/');
}

for(const viewport of [{width:1920,height:950},{width:1440,height:900},{width:390,height:680}]){
  test(`composer travels from the home position to the footer at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);
    await prepare(page);
    await page.getByLabel('Your question',{exact:true}).fill('Primera pregunta');
    const origin=await page.locator('.home-composer .composer').boundingBox();
    await page.getByRole('button',{name:'Send question',exact:true}).click();
    const form=page.locator('.composer-followup');
    await expect(form).toBeVisible();
    const start=await form.boundingBox();
    for(const key of ['x','y','width','height'])expect(Math.abs(start[key]-origin[key])).toBeLessThan(1);
    const animation=await form.evaluate(element=>{
      const animation=element.getAnimations()[0];
      const timing=animation.effect.getTiming();
      animation.currentTime=timing.duration/2;
      return timing;
    });
    expect(animation.duration).toBe(280);
    expect(animation.easing).toBe('cubic-bezier(0.77, 0, 0.175, 1)');
    const midway=await form.boundingBox();
    await form.evaluate(element=>element.getAnimations({subtree:true}).forEach(animation=>animation.finish()));
    const end=await form.boundingBox();
    expect(midway.y).toBeGreaterThan(start.y+10);
    expect(midway.y).toBeLessThan(end.y-10);
    const workspace=await page.locator('.chat-layout').boundingBox();
    expect(Math.abs(end.x+end.width/2-workspace.x-workspace.width/2)).toBeLessThan(1);
    expect(end.y+end.height).toBeLessThan(viewport.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.getByRole('button',{name:'Send question',exact:true})).toBeVisible();
    await page.getByLabel('Your question',{exact:true}).fill('Seguimiento');
    await page.getByRole('button',{name:'Send question',exact:true}).click();
    expect(await form.evaluate(element=>element.getAnimations().filter(animation=>animation.playState!=='finished').length)).toBe(0);
    expect(await form.boundingBox()).toEqual(end);
  });
}

test('reduced motion switches directly to the footer',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await prepare(page);
  await page.getByLabel('Your question',{exact:true}).fill('Sin desplazamiento');
  await page.getByLabel('Your question',{exact:true}).press('Enter');
  const form=page.locator('.composer-followup');
  await expect(form).toBeVisible();
  expect(await form.evaluate(element=>element.getAnimations({subtree:true}).length)).toBe(0);
  await expect(form).toHaveCSS('transform','none');
});

for(const failure of ['rejected movement','rejected child','unavailable API','invalid easing']){
  test(`sending keeps the interface visible with ${failure}`,async({page})=>{
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    // A browser without Web Animations also lacks the newer ScrollTimeline API.
    if(failure==='unavailable API')await page.addInitScript(()=>{window.ScrollTimeline=undefined;});
    await prepare(page);
    await page.evaluate(failure=>{
      const animate=Element.prototype.animate;
      if(failure==='unavailable API')Element.prototype.animate=undefined;
      else if(failure==='invalid easing')document.querySelector('.main-content').style.setProperty('--ease-in-out','invalid-curve');
      else Element.prototype.animate=function(...args){
        if(failure==='rejected movement'&&this.matches('.composer-followup')||failure==='rejected child'&&this.parentElement?.matches('.composer-followup'))throw new TypeError('Animation rejected');
        return animate.apply(this,args);
      };
    },failure);
    await page.getByLabel('Your question',{exact:true}).fill('Primera pregunta');
    await page.getByLabel('Your question',{exact:true}).press('Enter');
    await expect(page.locator('.markdown')).toContainText('Answer de prueba.');
    await expect(page.locator('.sidebar')).toBeVisible();
    const form=page.locator('.composer-followup');
    if(failure==='invalid easing')await form.evaluate(element=>element.getAnimations({subtree:true}).forEach(animation=>animation.finish()));
    await expect(form).toHaveCSS('transform','none');
    await page.getByLabel('Your question',{exact:true}).fill('Segunda pregunta');
    await page.getByRole('button',{name:'Send question',exact:true}).click();
    await expect(page.locator('.user-bubble')).toHaveCount(2);
    await expect(page.locator('.markdown')).toHaveCount(2);
    expect(errors).toEqual([]);
  });
}
