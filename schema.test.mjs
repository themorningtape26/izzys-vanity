import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',stranger='33333333-3333-4333-8333-333333333333';
test('database enforces invitations, isolation, revisions, quotas and private photo folders',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;create schema storage;
   create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id bigint generated always as identity,name text,bucket_id text);alter table storage.objects enable row level security;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
   grant usage on schema auth,storage,public to anon,authenticated;grant select,insert,delete on storage.objects to authenticated;grant usage on all sequences in schema storage to authenticated;
   insert into auth.users values('${alice}'),('${bob}'),('${stranger}');`);
  await db.exec(await readFile(new URL('./supabase/schema.sql',import.meta.url),'utf8'));
  await db.exec(`insert into vanity_accounts(user_id) values('${alice}'),('${bob}');set role authenticated;select set_config('request.jwt.claim.sub','${alice}',false);`);
  assert.equal((await db.query("select save_vanity_document('collection','{\"products\":[]}'::jsonb,0) as revision")).rows[0].revision,1);
  await assert.rejects(()=>db.query("select save_vanity_document('collection','{}',0)"),e=>e.code==='40001');
  await assert.rejects(()=>db.exec(`update vanity_documents set revision=0`),e=>e.code==='42501');
  assert.equal((await db.query('select user_id from vanity_accounts')).rows.length,1);
  await db.exec(`insert into storage.objects(name,bucket_id) values('${alice}/photo.jpg','vanity-photos');`);
  await assert.rejects(()=>db.exec(`insert into storage.objects(name,bucket_id) values('${bob}/photo.jpg','vanity-photos')`),e=>e.code==='42501');
  for(let i=0;i<40;i++)assert.equal((await db.query('select take_vanity_recognition() as allowed')).rows[0].allowed,true);
  assert.equal((await db.query('select take_vanity_recognition() as allowed')).rows[0].allowed,false);
  await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false);`);
  assert.equal((await db.query('select * from vanity_documents')).rows.length,0);
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await db.exec(`select set_config('request.jwt.claim.sub','${stranger}',false);`);
  await assert.rejects(()=>db.query("select save_vanity_document('collection','{}',0)"),e=>e.code==='42501');
  await assert.rejects(()=>db.query('select take_vanity_recognition()'),e=>e.code==='42501');
  await db.exec('reset role;set role anon;');
  await assert.rejects(()=>db.query("select save_vanity_document('collection','{}',0)"),e=>e.code==='42501');
  await assert.rejects(()=>db.query('select * from vanity_documents'),e=>e.code==='42501');
 }finally{await db.close();}
});
