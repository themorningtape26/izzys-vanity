import { categories, safeUrl, validateBackup, filterProducts } from './model.mjs';
import { createLocalStore } from './local-store.mjs';
import { createCloud, ConflictError } from './cloud.mjs';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state = {version:1, products:[], brands:[]}, view = 'collection', category = 'All', brandList = 'All lists', photo = '', photoBusy = false, photoGeneration = 0;
let toastTimer, pendingIdentification;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4000); }
const local = createLocalStore();
let cloud, config, userId = '', ready = false, opening = false, collectionPending = false, draftsPending = false;
let drafts = {product:null,brand:null}, draftTimer, suggestions, identifying = false;
let operations = Promise.resolve(), localWrites = Promise.resolve();
const key = suffix => `${userId}:${suffix}`;
const clone = value => structuredClone(value);
const enqueue = fn => { const result = operations.then(fn); operations = result.catch(()=>{}); return result; };
function status(message, error = false) { $('#sync-status').textContent = message; $('#sync-status').dataset.error = String(error); }
function reportSyncError(error) {
  status(error instanceof ConflictError ? error.message : 'Saved on this device. Cloud sync needs attention; please retry.', true);
  $('#retry-sync').hidden = error instanceof ConflictError;
  $('#load-cloud').hidden = false;
}
async function syncCollection() {
  const pending = await local.get(key('collection'));
  if (!pending?.pending) return;
  await cloud.save('collection', pending.value, pending.revision);
  await local.set(key('collection'), {...pending,pending:false});
  collectionPending = false;
}
async function persist(next) {
  if (!ready) throw new Error('Please sign in and open your collection first.');
  validateBackup(next);
  return enqueue(async()=>{
    const previous=await local.get(key('collection'));
    await local.set(key('collection'), {value:next,pending:true,revision:previous?.pending?previous.revision:cloud.revision('collection')});
    collectionPending=true; state=next; render(); status('Saved on this device · Syncing…');
    try { await syncCollection(); status('Saved privately to your cloud collection.'); $('#retry-sync').hidden=true; $('#load-cloud').hidden=true; }
    catch(error) { reportSyncError(error); }
  });
}
function captureDraft(kind) {
  const f=$(`#${kind}-form`);
  const fields=Object.fromEntries(new FormData(f));
  delete fields.save; delete fields.another;
  fields.favorite=Boolean(f.elements.favorite?.checked);
  return {fields,photo:kind==='product'?photo:'',updated:Date.now()};
}
function writeDrafts() {
  const snapshot=clone(drafts);
  draftsPending=true;
  localWrites=localWrites.catch(()=>{}).then(async()=>{draftsPending=true;const previous=await local.get(key('drafts'));await local.set(key('drafts'),{value:snapshot,pending:true,revision:previous?.pending?previous.revision:cloud.revision('drafts')});});
  return localWrites;
}
function rememberDraft(kind) {
  if (!ready) return;
  drafts[kind]=captureDraft(kind);
  $(`#${kind}-draft-status`).textContent='Saving draft…';
  writeDrafts().then(()=>{ $(`#${kind}-draft-status`).textContent='Draft saved on this device.'; }).catch(()=>{
    $(`#${kind}-draft-status`).textContent='Draft could not save on this device. Keep this form open and retry.';
  });
  clearTimeout(draftTimer); draftTimer=setTimeout(()=>flushDrafts().catch(reportSyncError),1200);
}
async function flushDrafts() {
  clearTimeout(draftTimer);
  await localWrites;
  if (!ready || !draftsPending) return;
  return enqueue(async()=>{
    const pending=await local.get(key('drafts')); if(!pending?.pending)return;
    await cloud.save('drafts',pending.value,pending.revision);
    // Serialize bookkeeping with inputs arriving while photos upload.
    localWrites=localWrites.catch(()=>{}).then(async()=>{
      const current=await local.get(key('drafts'));
      if(JSON.stringify(current?.value)===JSON.stringify(pending.value)){
        await local.set(key('drafts'),{value:pending.value,pending:false,revision:cloud.revision('drafts')});draftsPending=false;
        for(const kind of ['product','brand']) $(`#${kind}-draft-status`).textContent=drafts[kind]?'Draft saved privately.':'';
      }else if(current?.pending && current.revision===pending.revision){await local.set(key('drafts'),{...current,revision:cloud.revision('drafts')});}
    });
    await localWrites;
  });
}
async function clearDraft(kind) {
  drafts[kind]=null; clearTimeout(draftTimer); await writeDrafts();
  // Run after any older queued draft write, so a late response cannot resurrect it.
  await flushDrafts().catch(reportSyncError);
}
function restoreFields(kind,draft) {
  const f=$(`#${kind}-form`);
  for(const [name,value] of Object.entries(draft.fields||{})) {
    const input=f.elements.namedItem(name); if(!input || input.type==='file')continue;
    if(input.type==='checkbox') input.checked=Boolean(value); else input.value=String(value??'');
  }
  if(kind==='product'){photo=draft.photo||'';showPhoto();}
  $(`#${kind}-draft-status`).textContent='Restored your unfinished draft.';
}
function saveError(form, error) { form.querySelector('.form-error').textContent = error?.message || 'Could not save. Your browser storage may be full.'; }
function empty(title, text, action, label) { return `<div class="empty"><div class="flower">✧</div><h3>${title}</h3><p>${text}</p><button class="primary" data-action="${action}">${label}</button></div>`; }
function render() {
  $('#count').textContent = state.products.length;
  document.querySelectorAll('.tab').forEach(b => {b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
  $('#products-view').hidden = view === 'brands'; $('#brands-view').hidden = view !== 'brands';
  $('#categories').innerHTML = ['All',...categories].map(c => `<button class="chip ${c===category?'selected':''}" aria-pressed="${c===category}" data-category="${c}">${c}</button>`).join('');
  $('#collection-title').textContent = view === 'favorites' ? 'The forever favorites' : category === 'All' ? 'The whole collection' : category;
  const products = filterProducts(state.products,{category,view,query:$('#search').value,sort:$('#sort').value});
  $('#collection-caption').textContent = state.products.length ? `${products.length} lovely little ${products.length===1?'thing':'things'}${view==='favorites'?' you love most':''}.` : 'The things that make your routine yours.';
  $('#products').innerHTML = products.map(p => `<article class="card"><div class="card-media"><button class="open-card" data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.name)}"><div class="product-art">${p.photo?`<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">`:`<span class="monogram">${esc(p.name[0])}</span>`}</div></button><button class="heart" data-favorite="${esc(p.id)}" aria-label="${p.favorite?'Unfavorite':'Favorite'} ${esc(p.name)}" aria-pressed="${p.favorite}">${p.favorite?'♥':'♡'}</button></div><button class="open-card" data-edit="${esc(p.id)}"><div class="brand-name">${esc(p.brand || p.category)}</div><h3>${esc(p.name)}</h3><p class="detail">${esc(p.shade || p.category)}</p><span class="status ${p.status==='Running low'?'low':''}">${esc(p.status)}</span></button></article>`).join('') || (state.products.length ? empty('A little room for discovery','No products here yet. Try another filter, or add something you love.','product','＋ Add a product') : empty('Your vanity starts with a photo','Lipsticks, lotions, signature scents. Snap your first product and give your favorites a home.','product','＋ Add your first product'));
  const lists = [...new Set(state.brands.map(b=>b.list))].sort();
  if (!lists.includes(brandList)) brandList = 'All lists';
  $('#brand-lists').innerHTML = ['All lists',...lists].map(l=>`<button class="chip ${l===brandList?'selected':''}" aria-pressed="${l===brandList}" data-list="${esc(l)}">${esc(l)}</button>`).join('');
  $('#list-suggestions').innerHTML = [...new Set(['Everyday favorites','Try next','Gift ideas',...lists])].map(l=>`<option value="${esc(l)}"></option>`).join('');
  $('#brands').innerHTML = state.brands.filter(b=>brandList==='All lists'||b.list===brandList).map(b=>`<article class="card brand-card"><div class="initial">${esc(b.name[0])}</div><div class="brand-name">${esc(b.list)}</div><h3>${esc(b.name)}</h3><p class="detail">${esc(b.notes || 'A name worth remembering.')}</p><div class="brand-actions">${b.url?`<a href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener noreferrer">Shop the brand ↗</a>`:'<span class="detail">No link added yet</span>'}<button class="quiet" data-brand="${esc(b.id)}">Edit</button></div></article>`).join('') || empty('Keep your good taste close','Make lists for everyday favorites, brands to try, or gift ideas. Add a store link for easy shopping.','brand','＋ Add your first brand');
}
function showPhoto() { $('#photo-preview').hidden = !photo; if(photo) $('#photo-preview').src = photo; else $('#photo-preview').removeAttribute('src'); $('#photo-label').hidden = !!photo; $('#remove-photo').hidden = !photo; $('#identify-photo').hidden=!photo||!config?.recognition;$('#label-photo-control').hidden=!photo||!config?.recognition; }
function openProduct(id) {
  if(drafts.product && (drafts.product.fields.id||'')!==(id||'')){toast('Finish or discard your saved product draft first.');id=drafts.product.fields.id||undefined;}
  const f=$('#product-form'); f.reset();f.querySelector('.form-error').textContent='';photoGeneration++;photoBusy=false;photo='';
  suggestions=null;$('#suggestions').hidden=true;$('#photo-status').textContent='';$('#extra-details').open=false;
  const p=state.products.find(x=>x.id===id);
  if(p){for(const field of ['id','name','brand','category','shade','status','opened','months','notes'])f.elements[field].value=p[field];f.elements.favorite.checked=p.favorite;photo=p.photo;}
  else f.elements.category.value='';
  if(drafts.product && (drafts.product.fields.id||'')===(id||'')) restoreFields('product',drafts.product);
  else $('#product-draft-status').textContent=drafts.product?'Another unfinished product is saved. Open Add a product to return to it.':'';
  $('#product-form-title').textContent=p?'A little detail, updated':'Photo, check, and save';$('#delete-product').hidden=!p;showPhoto();$('#product-dialog').showModal();
}
function openBrand(id){
  if(drafts.brand && (drafts.brand.fields.id||'')!==(id||'')){toast('Finish or discard your saved brand draft first.');id=drafts.brand.fields.id||undefined;}
  const f=$('#brand-form');f.reset();f.querySelector('.form-error').textContent='';const b=state.brands.find(x=>x.id===id);
  if(b)for(const field of ['id','name','url','list','notes'])f.elements[field].value=b[field];
  if(drafts.brand && (drafts.brand.fields.id||'')===(id||''))restoreFields('brand',drafts.brand);
  $('#delete-brand').hidden=!b;$('#brand-dialog').showModal();
}
$('#product-category').innerHTML='<option value="">Choose a category</option>'+categories.map(c=>`<option>${c}</option>`).join('');
$('#add-product').onclick=()=>openProduct();$('#add-brand').onclick=()=>openBrand();
$('.logo').onclick=e=>{e.preventDefault();view='collection';category='All';$('#search').value='';render();};
for(const b of document.querySelectorAll('.close')) b.onclick=()=>b.closest('dialog').close();
for(const b of document.querySelectorAll('.tab')) b.onclick=()=>{view=b.dataset.view;render();};
$('#search').oninput=render;$('#sort').onchange=render;
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.category){category=b.dataset.category;render();}
  if(b.dataset.list){brandList=b.dataset.list;render();}
  if(b.dataset.edit)openProduct(b.dataset.edit);
  if(b.dataset.brand)openBrand(b.dataset.brand);
  if(b.dataset.action==='product')openProduct();if(b.dataset.action==='brand')openBrand();
  if(b.dataset.favorite){b.disabled=true;try{await persist({...state,products:state.products.map(p=>p.id===b.dataset.favorite?{...p,favorite:!p.favorite}:p)});}catch{toast('Could not save your favorite. Please try again.');b.disabled=false;}}
});
$('#remove-photo').onclick=()=>{photoGeneration++;photoBusy=false;photo='';$('#photo').value='';showPhoto();$('#suggestions').hidden=true;rememberDraft('product');};
async function imageData(file){
  if(file.size>25000000)throw new Error('Choose an image smaller than 25 MB.');
  if(!file.type.startsWith('image/'))throw new Error('Please choose an image.');
  const bitmap=await createImageBitmap(file);try{
    const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#faf7f2';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL('image/jpeg',.8);if(result.length>2800000)throw new Error('This photo is too large. Try a smaller or closer photo.');return result;
  }finally{bitmap.close();}
}
async function identify(image){
  if(!config?.recognition)return;
  if(identifying){pendingIdentification=image;return;}
  const generation=photoGeneration;identifying=true;$('#identify-photo').disabled=true;$('#photo-status').textContent='Reading the label… You can keep editing.';$('#suggestions').hidden=true;
  try{const result=await cloud.recognize(image);if(generation!==photoGeneration)return;
    suggestions=result;$('#photo-status').textContent=result.message;
    if(result.recognized){$('#suggestion-text').textContent=[result.name,result.brand,result.category,result.shade].filter(Boolean).join(' · ');$('#suggestions').hidden=false;}
    else $('#photo-status').textContent=result.message||'Try a clearer back-label photo, or enter the product name.';
  }catch(error){if(generation===photoGeneration)$('#photo-status').textContent=error.message;}
  finally{identifying=false;$('#identify-photo').disabled=false;if(pendingIdentification){const next=pendingIdentification;pendingIdentification=null;identify(next);}}
}
$('#identify-photo').onclick=()=>identify(photo);
$('#apply-suggestions').onclick=()=>{
  if(!suggestions)return;const f=$('#product-form');
  for(const field of ['name','brand','category','shade'])if(suggestions[field]&&!f.elements[field].value.trim())f.elements[field].value=suggestions[field];
  $('#suggestions').hidden=true;$('#photo-status').textContent='Details added. Check them before saving; existing text was kept.';rememberDraft('product');
};
for(const kind of ['product','brand']){
  $(`#${kind}-form`).addEventListener('input',()=>rememberDraft(kind));
  $(`#${kind}-form`).addEventListener('change',e=>{if(e.target.type!=='file')rememberDraft(kind);});
  $(`#discard-${kind}`).onclick=async()=>{if(confirm('Discard this unfinished draft?')){await clearDraft(kind);$(`#${kind}-dialog`).close();}};
}
$('#photo').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;const generation=++photoGeneration;photoBusy=true;$('#product-form .form-error').textContent='';
  try{const data=await imageData(file);if(generation===photoGeneration){photo=data;showPhoto();rememberDraft('product');identify(photo);}}
  catch(error){if(generation===photoGeneration)saveError($('#product-form'),new Error('Could not read this image. Try a JPEG, PNG or WebP photo. '+error.message));}
  finally{if(generation===photoGeneration)photoBusy=false;}
};
$('#label-photo').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{await identify(await imageData(file));}catch(error){$('#photo-status').textContent=error.message;}finally{e.target.value='';}};
$('#product-form').onsubmit=async e=>{e.preventDefault();const f=e.target;if(f.dataset.saving)return;if(photoBusy){saveError(f,new Error('Your photo is still processing. Try saving in a moment.'));return;}const data=Object.fromEntries(new FormData(f));const another=e.submitter?.name==='another';const old=state.products.find(p=>p.id===data.id);const product={...data,name:data.name.trim(),id:old?.id||crypto.randomUUID(),favorite:f.elements.favorite.checked,photo,created:old?.created||Date.now()};const next={...state,products:old?state.products.map(p=>p.id===old.id?product:p):[product,...state.products]};const buttons=[...f.querySelectorAll('[type=submit]')];f.dataset.saving='true';buttons.forEach(b=>b.disabled=true);try{validateBackup(next);await persist(next);await clearDraft('product');$('#product-dialog').close();toast(collectionPending?'Saved on this device. Cloud sync is pending.':'A lovely addition. Saved privately.');if(another)openProduct();}catch(err){saveError(f,err);}finally{delete f.dataset.saving;buttons.forEach(b=>b.disabled=false);}};
$('#brand-form').onsubmit=async e=>{e.preventDefault();const f=e.target;const button=f.querySelector('[type=submit]');button.disabled=true;try{const data=Object.fromEntries(new FormData(f));const old=state.brands.find(b=>b.id===data.id);const brand={...data,name:data.name.trim(),list:data.list.trim(),url:safeUrl(data.url.trim()),id:old?.id||crypto.randomUUID(),created:old?.created||Date.now()};const next={...state,brands:old?state.brands.map(b=>b.id===old.id?brand:b):[...state.brands,brand]};validateBackup(next);await persist(next);await clearDraft('brand');$('#brand-dialog').close();toast(collectionPending?'Saved on this device. Cloud sync is pending.':'Saved to your brand book.');}catch(err){saveError(f,err);}finally{button.disabled=false;}};
for(const kind of ['product','brand']) $('#delete-'+kind).onclick=async()=>{const form=$('#'+kind+'-form');const id=form.elements.id.value;if(!confirm(`Delete this ${kind}? This cannot be undone.`))return;try{await persist({...state,[kind+'s']:state[kind+'s'].filter(x=>x.id!==id)});await clearDraft(kind);$('#'+kind+'-dialog').close();toast('Removed from your collection.');}catch(err){saveError(form,err);}};
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({...state,drafts})],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`izzys-vanity-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Backup includes your products, photos, brand lists, and unfinished drafts.');};
$('#import').onclick=()=>$('#backup-file').click();
$('#backup-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100000000)throw new Error('This backup is too large (maximum 100 MB).');const backup=JSON.parse(await file.text());const next=validateBackup(backup);if(confirm(`Restore ${next.products.length} products and ${next.brands.length} brands? This replaces the current collection. Back up first if you want to keep it.`)){await persist(next);if(backup.drafts && typeof backup.drafts==='object'){
      for(const kind of ['product','brand']){const draft=backup.drafts[kind];if(!draft?.fields||typeof draft.fields!=='object')continue;const fields={};for(const name of ['id','name','brand','category','shade','status','opened','months','notes','favorite','url','list']){const value=draft.fields[name];if(typeof value==='string'||typeof value==='boolean')fields[name]=value;}const image=typeof draft.photo==='string'&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(draft.photo)&&draft.photo.length<=2800000?draft.photo:'';drafts[kind]={fields,photo:image,updated:Date.now()};}await writeDrafts();await flushDrafts().catch(reportSyncError);
    }toast('Your collection is restored.');}}catch(err){toast(err instanceof SyntaxError?'This is not a valid backup file.':err.message);}finally{e.target.value='';}};
async function openAccount(){
  if(ready||opening)return;opening=true;
  $('#auth-intro').textContent='Opening your private collection…';
  try{
    const user=await cloud.authorize();userId=user.id;
    // Do not overwrite an offline edit with an older cloud snapshot.
    const remote=await cloud.load('collection');const remoteDrafts=await cloud.load('drafts');
    const cached=await local.get(key('collection'));const cachedDrafts=await local.get(key('drafts'));
    state=validateBackup(cached?.pending?cached.value:(remote||{version:1,products:[],brands:[]}));
    drafts=cachedDrafts?.pending?cachedDrafts.value:(remoteDrafts||{product:null,brand:null});
    collectionPending=Boolean(cached?.pending);draftsPending=Boolean(cachedDrafts?.pending);
    // Pending snapshots are never automatically rebased: the remote revision may have changed offline.
    ready=true;$('#auth-panel').hidden=true;$('#app-main').hidden=false;$('#sign-out').hidden=false;render();
    $('#migrate-local').hidden=!((await local.get('vanity'))?.products?.length || (await local.get('vanity'))?.brands?.length);
    if(collectionPending||draftsPending){status('Recovered device changes. Back up if needed, then retry sync or load the cloud version.',true);$('#retry-sync').hidden=false;$('#load-cloud').hidden=false;}
    else status('Private collection ready · Drafts save automatically.');
    if(drafts.product){openProduct(drafts.product.fields?.id||undefined);}
    else if(drafts.brand){openBrand(drafts.brand.fields?.id||undefined);}
  }catch(error){$('#auth-intro').textContent=error.message;$('#auth-form').hidden=false;}finally{opening=false;}
}
$('#auth-form').onsubmit=async e=>{
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
  $('#auth-message').textContent='Signing in…';
  try{const email=e.target.elements.email.value.trim();const password=e.target.elements.password.value;
    const {error}=await cloud.client.auth.signInWithPassword({email,password});
    if(error)throw error;e.target.elements.password.value='';$('#auth-message').textContent='';await openAccount();
  }catch(error){$('#auth-message').textContent=error.message;}finally{button.disabled=false;}
};
$('#sign-out').onclick=async()=>{
  try{await localWrites;await flushDrafts();await enqueue(syncCollection);
    if(collectionPending||draftsPending)throw new Error('Please sync your changes before signing out.');
    const {error}=await cloud.client.auth.signOut();if(error)throw error;
    await local.remove(key('collection'));await local.remove(key('drafts'));location.reload();
  }catch(error){toast('Could not finish syncing. Stay signed in to keep your device draft. '+error.message);}
};
$('#retry-sync').onclick=async()=>{
  try{await enqueue(syncCollection);await flushDrafts();$('#retry-sync').hidden=true;$('#load-cloud').hidden=true;status('Everything is saved privately.');}
  catch(error){reportSyncError(error);}
};
$('#load-cloud').onclick=async()=>{
  if(!confirm('This replaces this device’s pending edits with the cloud version. Use Back up first to keep a copy. Continue?'))return;
  ready=false;
  for(const kind of ['product','brand'])$(`#${kind}-dialog`).close();
  clearTimeout(draftTimer);await localWrites;await operations;
  await local.remove(key('collection'));await local.remove(key('drafts'));collectionPending=false;draftsPending=false;await openAccount();
};
$('#migrate-local').onclick=async()=>{
  try{const previous=validateBackup(await local.get('vanity'));
    if(!confirm(`Import ${previous.products.length} products and ${previous.brands.length} brands from the earlier browser-only app? Your cloud collection will be kept too.`))return;
    const merge=(a,b)=>[...a,...b.filter(x=>!a.some(y=>y.id===x.id))];
    await persist({version:1,products:merge(state.products,previous.products),brands:merge(state.brands,previous.brands)});
    $('#migrate-local').hidden=true;
  }catch(error){toast(error.message);}
};
window.addEventListener('online',()=>{if(ready&&!collectionPending)flushDrafts().catch(reportSyncError);});
window.addEventListener('pagehide',()=>{if(ready)flushDrafts().catch(()=>{});});
window.addEventListener('beforeunload',e=>{if(photoBusy){e.preventDefault();e.returnValue='';}});
async function init(){
  try{
    const response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)throw new Error('Setup is not connected yet.');config=await response.json();
    if(!config.url||!config.key)throw new Error('Your private cloud connection is being set up. Please come back once setup is complete.');
    cloud=createCloud(config);$('#auth-intro').textContent='Sign in with your email and password. Your products and photos stay private.';$('#auth-form').hidden=false;
    cloud.client.auth.onAuthStateChange(event=>{if(['SIGNED_IN','INITIAL_SESSION'].includes(event))setTimeout(()=>openAccount(),0);if(event==='SIGNED_OUT'){ready=false;$('#app-main').hidden=true;$('#auth-panel').hidden=false;$('#sign-out').hidden=true;}});
    const {data}=await cloud.client.auth.getSession();if(data.session)await openAccount();
  }catch(error){$('#auth-intro').textContent=error.message;$('#auth-form').hidden=true;}
}
init();
