import {test,expect} from '@playwright/test';
const uid='11111111-1111-4111-8111-111111111111';
const empty=()=>({version:1,products:[],brands:[]});
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP433AAiBggFAA/7gj9rLf4agAAAABJRU5ErkJggg==','base64');
async function setup(context, {signedIn=true, db={collection:{payload:empty(),revision:0},drafts:{payload:{product:null,brand:null},revision:0}},control={offline:false}}={}){
  await context.addInitScript(({uid,token,signedIn})=>{if(signedIn&&!localStorage.getItem('sb-vanitytest-auth-token'))localStorage.setItem('sb-vanitytest-auth-token',JSON.stringify({access_token:token,refresh_token:'refresh-test',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:uid,email:'izzy@example.com',aud:'authenticated'}}));},{uid,token,signedIn});
  const photos=new Map();
  await context.route('**/api/config',route=>route.fulfill({json:{url:'https://vanitytest.supabase.co',key:'public-test-key',recognition:true}}));
  await context.route('https://vanitytest.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==='OPTIONS')return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'}});
    const fulfill=(json,status=200)=>route.fulfill({status,json,headers:{'Access-Control-Allow-Origin':'*'}});
    if(url.pathname==='/auth/v1/user')return fulfill({id:uid,email:'izzy@example.com',aud:'authenticated'});
    if(url.pathname==='/rest/v1/vanity_accounts')return fulfill([{user_id:uid}]);
    if(url.pathname==='/rest/v1/vanity_documents'){const kind=url.searchParams.get('kind')?.replace('eq.','');return fulfill(db[kind]?[db[kind]]:[]);}
    if(url.pathname==='/rest/v1/rpc/save_vanity_document'){
      if(control.offline)return route.abort();
      const body=req.postDataJSON(),doc=db[body.document_kind]||{revision:0};
      if(doc.revision!==body.expected_revision)return fulfill({code:'40001',message:'Conflict'},409);
      db[body.document_kind]={payload:body.document_payload,revision:doc.revision+1};return fulfill(doc.revision+1);
    }
    if(url.pathname.startsWith('/storage/v1/object/')){
      const path=url.pathname.replace('/storage/v1/object/','').replace(/^authenticated\//,'');
      if(req.method()==='POST'){photos.set(path,req.postDataBuffer());return fulfill({Key:path});}
      if(photos.has(path))return route.fulfill({body:photos.get(path),contentType:'image/jpeg',headers:{'Access-Control-Allow-Origin':'*'}});
      return fulfill({message:'missing'},404);
    }
    return fulfill({message:'Unhandled '+url.pathname},500);
  });
  await context.route('**/api/identify',route=>route.fulfill({json:{recognized:true,name:'Bond Repair Styling Cream',brand:'Bumble and bumble',category:'Hair care',shade:null,needsBackLabel:false,message:'Check the name against your label.'}}));
  return {db,control};
}

test('mobile photo draft survives reload; suggestions are confirmed and product is saved once',async({page,context})=>{
  const {db}=await setup(context);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:375,height:812});await page.goto('/');await expect(page.locator('#app-main')).toBeVisible();
  await page.locator('#add-product').click();await page.locator('#photo').setInputFiles({name:'cream.png',mimeType:'image/png',buffer:pixel});
  await expect(page.locator('#suggestions')).toBeVisible();await expect(page.locator('#product-draft-status')).toContainText('saved');
  await expect.poll(()=>Boolean(db.drafts.payload.product?.photoPath)).toBe(true);
  await page.reload();await expect(page.locator('#product-dialog')).toBeVisible();await expect(page.locator('#photo-preview')).toBeVisible();
  await page.locator('#identify-photo').click();await expect(page.locator('#suggestions')).toBeVisible();
  await page.locator('[name=name]').first().fill('My own label');await page.locator('#apply-suggestions').click();
  await expect(page.locator('#product-form [name=name]')).toHaveValue('My own label');
  await expect(page.locator('#product-category')).toHaveValue('Hair care');
  await expect(page.locator('#extra-details')).not.toHaveAttribute('open','');
  await page.getByRole('button',{name:'Save & add another',exact:true}).click();await expect(page.locator('#count')).toHaveText('1');
  await expect(page.locator('#product-form [name=name]')).toHaveValue('');
  expect(db.collection.payload.products).toHaveLength(1);expect(db.collection.payload.products[0].photo).toBe('');expect(db.collection.payload.products[0].photoPath).toMatch(new RegExp('^'+uid+'/'));
  await page.reload();await expect(page.locator('#count')).toHaveText('1');await expect(page.locator('#product-dialog')).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('unauthenticated visitors cannot open a collection',async({page,context})=>{
  await setup(context,{signedIn:false});await page.goto('/');await expect(page.locator('#auth-form')).toBeVisible();await expect(page.locator('#app-main')).toBeHidden();
});

test('offline save survives reload and cannot overwrite a later cloud revision',async({page,context})=>{
  const {db,control}=await setup(context);await page.goto('/');await expect(page.locator('#app-main')).toBeVisible();
  await page.locator('#add-product').click();await page.locator('#product-form [name=name]').fill('Offline cream');await page.locator('#product-category').selectOption('Skincare');
  control.offline=true;await page.getByRole('button',{name:'Save product',exact:true}).click();await expect(page.locator('#count')).toHaveText('1');
  await expect(page.locator('#sync-status')).toContainText('Cloud sync');
  db.collection={payload:empty(),revision:7};control.offline=false;await page.reload();await expect(page.locator('#count')).toHaveText('1');
  await page.locator('#retry-sync').click();await expect(page.locator('#sync-status')).toContainText('changed on another device');
  expect(db.collection.revision).toBe(7);expect(db.collection.payload.products).toHaveLength(0);
});
