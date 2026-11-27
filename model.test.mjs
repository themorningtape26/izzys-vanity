import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, safeUrl, filterProducts } from './model.mjs';
const product={id:'p1',name:'Lip cream',brand:'Rose',category:'Makeup',shade:'Mauve',status:'Running low',opened:'2026-11-01',months:'12',notes:'Everyday favorite',photo:'',favorite:true,created:1};
const backup=()=>({version:1,products:[{...product}],brands:[{id:'b1',name:'Rose',list:'Try next',url:'https://example.com',notes:'',created:2}]});
test('backup roundtrip retains product metadata, photo, and brand lists',()=>{const data=backup();data.products[0].photo='data:image/jpeg;base64,YWJj';assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data))),data);});
test('rejects executable shopping links and photo payloads',()=>{assert.throws(()=>safeUrl('javascript:alert(1)'));assert.throws(()=>safeUrl('data:text/html,test'));const data=backup();data.products[0].photo='data:image/svg+xml;base64,YWJj';assert.throws(()=>validateBackup(data));});
test('invalid or duplicate records cannot replace a collection',()=>{const data=backup();data.brands[0].id='p1';assert.throws(()=>validateBackup(data));const invalid=backup();invalid.products[0].months='-2';assert.throws(()=>validateBackup(invalid));assert.throws(()=>validateBackup({version:2,products:[],brands:[]}));});
test('search combines category and favorites and searches shades',()=>{const other={...product,id:'p2',name:'Body cream',category:'Body & lotions',favorite:false,created:2};assert.deepEqual(filterProducts([product,other],{category:'Makeup',view:'favorites',query:' MAUVE '}),[product]);assert.equal(filterProducts([product,other],{category:'Fragrance'}).length,0);assert.equal(filterProducts([product,other])[0].id,'p2');});
