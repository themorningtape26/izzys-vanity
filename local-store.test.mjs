import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createLocalStore } from './local-store.mjs';

test('drafts and photos survive fresh handles and deletion is scoped',async()=>{
  const factory=new IDBFactory(),store=createLocalStore(factory);
  const draft={fields:{name:'Cream'},photo:'data:image/jpeg;base64,YWJj'};
  await store.set('alice:drafts',draft);await store.set('bob:drafts',{fields:{name:'Other'}});
  assert.deepEqual(await store.get('alice:drafts'),draft);
  await store.remove('alice:drafts');assert.equal(await store.get('alice:drafts'),undefined);
  assert.equal((await store.get('bob:drafts')).fields.name,'Other');
});
test('closing-connection error retries with a new connection',async()=>{
  const factory=new IDBFactory();let failures=0;
  const proxy={open(...args){const request=factory.open(...args);const descriptor={};Object.defineProperty(descriptor,'onsuccess',{set(handler){request.onsuccess=()=>{const db=request.result;const transaction=db.transaction.bind(db);db.transaction=(...txArgs)=>{if(failures++===0)throw new DOMException('connection is closing','InvalidStateError');return transaction(...txArgs);};handler();};}});for(const name of ['onerror','onblocked','onupgradeneeded'])Object.defineProperty(descriptor,name,{set(value){request[name]=value;}});Object.defineProperty(descriptor,'result',{get:()=>request.result});return descriptor;}};
  const store=createLocalStore(proxy);await store.set('draft',{photo:'kept'});assert.deepEqual(await store.get('draft'),{photo:'kept'});assert.ok(failures>=2);
});
