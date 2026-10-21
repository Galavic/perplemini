import {test,expect} from '@playwright/test';

test('custom scrollbar stays beyond sources, supports dragging, and the input fades the transcript',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.route('**/api/status',r=>r.fulfill({json:{available:true,cliProviders:[]}}));
  await page.route('**/api/models',r=>r.fulfill({json:{providers:[]}}));
  await page.addInitScript(()=>localStorage.setItem('perplemini.threads',JSON.stringify([{id:'scroll-test',title:'Scrolling',messages:[
    {id:'question',role:'user',content:'Long answer'},
    {id:'answer',role:'assistant',content:Array.from({length:50},(_,i)=>`Paragraph ${i+1}. Content to verify scrolling, dragging and a soft fade above the composer.`).join('\n\n'),sources:[{id:1,title:'Reference',url:'https://example.org',domain:'example.org'}]},
  ]}])));
  await page.goto('/');await page.locator('.history-item').click();
  const viewport=page.locator('.conversation');
  await viewport.hover();
  const handle=viewport.locator('.os-scrollbar-vertical .os-scrollbar-handle');
  await expect(handle).toBeVisible();
  const before=await viewport.evaluate(element=>element.scrollTop);
  const bounds=await handle.boundingBox(),sources=await page.locator('.sources-panel').boundingBox();
  expect(bounds.x).toBeGreaterThan(sources.x+sources.width);
  const composer=await page.locator('.composer-followup').boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2+80,{steps:10});await page.mouse.up();
  await expect.poll(()=>viewport.evaluate(element=>element.scrollTop)).toBeGreaterThan(before+100);
  expect(await page.locator('.composer-followup').boundingBox()).toEqual(composer);
  const fade=await page.locator('.followup-container').evaluate(element=>{
    const style=getComputedStyle(element,'::before');return {image:style.backgroundImage,events:style.pointerEvents,height:style.height};
  });
  expect(fade.image).toContain('linear-gradient');expect(fade.events).toBe('none');expect(fade.height).toBe('64px');
  await expect(viewport).toHaveCSS('scrollbar-width','none');
  await page.screenshot({path:'test-results/custom-scrollbars.png'});
});
