import { categories, safeUrl, validateBackup, filterProducts } from './model.mjs';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db, state = {version:1, products:[], brands:[]}, view = 'collection', category = 'All', brandList = 'All lists', photo = '', photoBusy = false, photoGeneration = 0;
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4000); }
function persist(next) { return new Promise((resolve,reject) => { const tx = db.transaction('collection','readwrite'); tx.objectStore('collection').put(next,'vanity'); tx.oncomplete = () => {state = next; render();resolve();}; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Save interrupted')); }); }
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
function showPhoto() { $('#photo-preview').hidden = !photo; if(photo) $('#photo-preview').src = photo; else $('#photo-preview').removeAttribute('src'); $('#photo-label').hidden = !!photo; $('#remove-photo').hidden = !photo; }
function openProduct(id) {
  const f = $('#product-form');f.reset();f.querySelector('.form-error').textContent = '';photoGeneration++;photoBusy=false;photo='';
  const p = state.products.find(x=>x.id===id);
  if(p) { for(const key of ['id','name','brand','category','shade','status','opened','months','notes']) f.elements[key].value=p[key]; f.elements.favorite.checked=p.favorite;photo=p.photo; }
  $('#product-form-title').textContent=p?'A little detail, updated':'Add to your vanity'; $('#delete-product').hidden=!p;showPhoto();$('#product-dialog').showModal();
}
function openBrand(id) {const f=$('#brand-form');f.reset();f.querySelector('.form-error').textContent='';const b=state.brands.find(x=>x.id===id);if(b) for(const key of ['id','name','url','list','notes']) f.elements[key].value=b[key];$('#delete-brand').hidden=!b;$('#brand-dialog').showModal();}
$('#product-category').innerHTML=categories.map(c=>`<option>${c}</option>`).join('');
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
$('#remove-photo').onclick=()=>{photoGeneration++;photoBusy=false;photo='';$('#photo').value='';showPhoto();};
$('#photo').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;const generation=++photoGeneration;photoBusy=true;$('#product-form .form-error').textContent='';
  try {if(file.size>25000000)throw new Error('Choose an image smaller than 25 MB.');if(!file.type.startsWith('image/'))throw new Error('Please choose an image.');
    const bitmap=await createImageBitmap(file);const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#faf7f2';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();if(generation===photoGeneration){photo=canvas.toDataURL('image/jpeg',.85);showPhoto();}
  }catch(err){if(generation===photoGeneration)saveError($('#product-form'),new Error(err.message.includes('decode')?'This image could not be read. Try a JPEG, PNG, or WebP photo.':err.message));}finally{if(generation===photoGeneration)photoBusy=false;}
};
$('#product-form').onsubmit=async e=>{e.preventDefault();const f=e.target;if(photoBusy){saveError(f,new Error('Your photo is still processing. Try saving in a moment.'));return;}const data=Object.fromEntries(new FormData(f));const old=state.products.find(p=>p.id===data.id);const product={...data,name:data.name.trim(),id:old?.id||crypto.randomUUID(),favorite:f.elements.favorite.checked,photo,created:old?.created||Date.now()};const next={...state,products:old?state.products.map(p=>p.id===old.id?product:p):[product,...state.products]};const button=f.querySelector('[type=submit]');button.disabled=true;try{validateBackup(next);await persist(next);$('#product-dialog').close();toast('A lovely addition. Saved to your vanity.');}catch(err){saveError(f,err);}finally{button.disabled=false;}};
$('#brand-form').onsubmit=async e=>{e.preventDefault();const f=e.target;const button=f.querySelector('[type=submit]');button.disabled=true;try{const data=Object.fromEntries(new FormData(f));const old=state.brands.find(b=>b.id===data.id);const brand={...data,name:data.name.trim(),list:data.list.trim(),url:safeUrl(data.url.trim()),id:old?.id||crypto.randomUUID(),created:old?.created||Date.now()};const next={...state,brands:old?state.brands.map(b=>b.id===old.id?brand:b):[...state.brands,brand]};validateBackup(next);await persist(next);$('#brand-dialog').close();toast('Saved to your brand book.');}catch(err){saveError(f,err);}finally{button.disabled=false;}};
for(const kind of ['product','brand']) $('#delete-'+kind).onclick=async()=>{const form=$('#'+kind+'-form');const id=form.elements.id.value;if(!confirm(`Delete this ${kind}? This cannot be undone.`))return;try{await persist({...state,[kind+'s']:state[kind+'s'].filter(x=>x.id!==id)});$('#'+kind+'-dialog').close();toast('Removed from your collection.');}catch(err){saveError(form,err);}};
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify(state)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`izzys-vanity-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Backup includes your products, photos, and brand lists.');};
$('#import').onclick=()=>$('#backup-file').click();
$('#backup-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100000000)throw new Error('This backup is too large (maximum 100 MB).');const next=validateBackup(JSON.parse(await file.text()));if(confirm(`Restore ${next.products.length} products and ${next.brands.length} brands? This replaces the current collection. Back up first if you want to keep it.`)){await persist(next);toast('Your collection is restored.');}}catch(err){toast(err instanceof SyntaxError?'This is not a valid backup file.':err.message);}finally{e.target.value='';}};
async function init(){try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open('izzys-vanity',1);r.onupgradeneeded=()=>r.result.createObjectStore('collection');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const stored=await new Promise((resolve,reject)=>{const r=db.transaction('collection').objectStore('collection').get('vanity');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(stored)state=validateBackup(stored);render();}catch(err){$('#products').innerHTML=empty('Your vanity couldn’t open','Browser storage is unavailable or the saved collection could not be read. Try a regular browser window with storage enabled.','','Storage unavailable');document.querySelectorAll('button').forEach(b=>b.disabled=true);toast(err.message);}}
init();
