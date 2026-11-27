import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImage, recognitionSchema } from './lib/recognition.mjs';
import identify from './api/identify.js';
import config from './api/config.js';
const response=()=>({headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
test('recognition rejects disguised files and oversized images',()=>{
  assert.throws(()=>validateImage('data:image/jpeg;base64,YWJj'));
  assert.throws(()=>validateImage('data:image/svg+xml;base64,YWJj'));
  assert.throws(()=>validateImage('data:image/jpeg;base64,'+'A'.repeat(3_000_000)));
  assert.equal(validateImage('data:image/jpeg;base64,/9j/2Q=='),'data:image/jpeg;base64,/9j/2Q==');
  assert.throws(()=>recognitionSchema.parse({recognized:true,name:'x',category:'guess'}));
});
test('public config never includes the private inference key',()=>{
  const previous=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='secret-test-value';
  try{const res=response();config({},res);assert.ok(!JSON.stringify(res.body).includes('secret-test-value'));assert.equal(res.headers['Cache-Control'],'no-store');}
  finally{if(previous===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=previous;}
});
test('recognition rejects unsupported method and fails closed without configuration',async()=>{
  let res=response();await identify({method:'GET',headers:{}},res);assert.equal(res.statusCode,405);
  res=response();await identify({method:'POST',headers:{},body:{}},res);assert.equal(res.statusCode,503);
});
