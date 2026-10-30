import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { buildSeedSql } from '../scripts/generate-seed-sql.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const S='33333333-3333-4333-8333-333333333333';
const ADM='44444444-4444-4444-8444-444444444444';
const media=(u,n)=>`storage://poetek-media/${u}/covers/${n}.png`;

test('PostgreSQL migrations and authorization boundaries',async t=>{
 const db=new PGlite({extensions:{pgcrypto,unaccent}});
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
    create publication supabase_realtime;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant execute on function auth.uid(),storage.foldername(text) to anon,authenticated;
  `);
  await db.exec(fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8'));
  // Supabase's default table grants are reproduced in the isolated fixture.
  await db.exec('grant all on all tables in schema public,storage to anon,authenticated;');
  const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
  for(const name of migrations) {
    if (name === '20261030_publication_security.sql') {
      await db.exec(`alter function public.slugify(text) set search_path=public,extensions;
        insert into auth.users(id,email,raw_user_meta_data) values('55555555-5555-4555-8555-555555555555','legacy@example.com','{"display_name":"Legacy"}');
        update public.profiles set last_author='Existing preference' where id='55555555-5555-4555-8555-555555555555';`);
    }
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
  }
  const last=fs.readFileSync(path.join(root,'supabase/migrations/20261030_restrict_rpc_surface.sql'),'utf8');
  await db.exec(last); // Safe to reapply after a partially coordinated release.
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
    ('${A}','a@example.com','{"display_name":"Èva"}'),('${B}','b@example.com','{"display_name":"Èva"}'),
    ('${S}','s@example.com','{"display_name":"Suspended"}'),('${ADM}','admin@example.com','{"display_name":"Admin"}');
    update public.profiles set status='suspended' where id='${S}';
    update public.profiles set role='admin' where id='${ADM}';
    insert into public.collections(id,owner_id,author_name,title) values('collection-a','${A}','Èva','A'),('collection-b','${B}','Èva','B');
    insert into public.works(id,owner_id,author_name,body,status,card) values
      ('work-public','${A}','Èva','Public','published','{"imageId":"${media(A,'public')}"}'),
      ('work-draft','${A}','Èva','Private','draft','{"imageId":"${media(A,'draft')}"}'),
      ('work-suspended','${S}','Suspended','Test','published','{}');
    insert into storage.objects(bucket_id,name) values('poetek-media','${A}/covers/public.png'),('poetek-media','${A}/covers/draft.png'),('poetek-media','${A}/covers/orphan.png');`);
  const as=async(role,uid,sql)=>{
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid||''}',false); set role ${role};`);
    try{return await db.query(sql);}finally{await db.exec('reset role');}
  };
  await t.test('accented names generate valid profiles after all migrations',async()=>{
    const r=await db.query(`select public.slugify('Èva Rósi') as slug`);assert.equal(r.rows[0].slug,'eva-rosi');
  });
  await t.test('no exposed privileged function can be called by browser roles',async()=>{
    const r=await db.query(`select count(*) as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))`);
    assert.equal(Number(r.rows[0].n),0);
  });
  await t.test('upgrade preserves existing preferences privately',async()=>{
    assert.equal((await db.query("select last_author from public.profile_preferences where user_id='55555555-5555-4555-8555-555555555555'")).rows[0].last_author,'Existing preference');
    assert.equal((await as('anon','',"select last_author from public.profiles where id='55555555-5555-4555-8555-555555555555'")).rows[0].last_author,null);
  });
  await t.test('public reads exclude drafts; owners can read them',async()=>{
    assert.equal((await as('anon','',`select id from public.works where id='work-draft'`)).rows.length,0);
    assert.equal((await as('authenticated',A,`select id from public.works where id='work-draft'`)).rows.length,1);
  });
  await t.test('legacy reading preferences are private and old clients still work',async()=>{
    await as('authenticated',A,`update public.profiles set last_author='Private reader choice' where id='${A}'`);
    assert.equal((await as('anon','',`select last_author from public.profiles where id='${A}'`)).rows[0].last_author,null);
    await assert.rejects(as('anon','',`select * from public.profile_preferences`),/permission denied/);
    assert.equal((await as('authenticated',B,`select * from public.profile_preferences`)).rows.length,0);
    assert.equal((await as('authenticated',A,`select last_author from public.profile_preferences`)).rows[0].last_author,'Private reader choice');
    await assert.rejects(as('authenticated',B,`insert into public.profile_preferences values('${A}','stolen') on conflict(user_id) do update set last_author='stolen'`),/row-level security/);
  });
  await t.test('draft and unreferenced images stay private, published images are visible',async()=>{
    assert.deepEqual((await as('anon','',`select name from storage.objects order by name`)).rows.map(r=>r.name),[`${A}/covers/public.png`]);
    assert.equal((await as('authenticated',A,`select name from storage.objects`)).rows.length,3);
    assert.equal((await as('authenticated',B,`select name from storage.objects`)).rows.length,1);
  });
  await t.test('another author cannot make a private image public by referencing it',async()=>{
    await assert.rejects(as('authenticated',B,`insert into public.works(id,owner_id,author_name,body,card) values('steal-image','${B}','B','test','{"imageId":"${media(A,'draft')}"}')`),/Media must belong/);
    await assert.rejects(as('authenticated',B,`update public.profiles set avatar_url='${media(A,'draft')}' where id='${B}'`),/Media must belong/);
  });
  await t.test('cross-owner collection membership is rejected',async()=>{
    await assert.rejects(as('authenticated',B,`insert into public.works(id,owner_id,collection_id,author_name,body) values('steal-collection','${B}','collection-a','B','test')`),/Collection must belong/);
    await as('authenticated',B,`insert into public.works(id,owner_id,collection_id,author_name,body) values('own-collection','${B}','collection-b','B','test')`);
  });
  await t.test('stored markup is rejected in identifiers',async()=>{
    await assert.rejects(as('authenticated',A,`insert into public.works(id,owner_id,author_name,body) values('bad"><img>','${A}','A','test')`),/works_safe_id/);
  });
  await t.test('suspended JWT cannot publish, edit, delete, follow, upload or record readings',async()=>{
    await assert.rejects(as('authenticated',S,`insert into public.works(id,owner_id,author_name,body) values('suspended-insert','${S}','S','test')`),/row-level security/);
    assert.equal((await as('authenticated',S,`update public.works set body='changed' where id='work-suspended' returning id`)).rows.length,0);
    assert.equal((await as('authenticated',S,`delete from public.works where id='work-suspended' returning id`)).rows.length,0);
    await assert.rejects(as('authenticated',S,`insert into public.author_follows values('${S}','${A}',now())`),/row-level security/);
    await assert.rejects(as('authenticated',S,`insert into storage.objects(bucket_id,name) values('poetek-media','${S}/covers/a.png')`),/row-level security/);
    await assert.rejects(as('authenticated',S,`select public.record_reading('poem','work-public')`),/Active account/);
  });
  await t.test('client cannot promote themselves, and active admin can moderate',async()=>{
    await as('authenticated',A,`update public.profiles set role='admin' where id='${A}'`);
    assert.equal((await db.query(`select role from public.profiles where id='${A}'`)).rows[0].role,'author');
    await as('authenticated',ADM,`update public.works set title='Moderated' where id='work-public'`);
    assert.equal((await db.query(`select title from public.works where id='work-public'`)).rows[0].title,'Moderated');
  });
  await t.test('reading RPC validates visibility and deduplicates',async()=>{
    await assert.rejects(as('authenticated',B,`select public.record_reading('poem','work-draft')`),/Subject unavailable/);
    await as('authenticated',B,`select public.record_reading('poem','work-public')`);
    const r=await as('authenticated',B,`select public.record_reading('poem','work-public') as count`);assert.equal(Number(r.rows[0].count),1);
  });
  await t.test('seed SQL executes without removed prototype files and is idempotent',async()=>{
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    const example=[{id:'demo-benvenuto',author:'Test author',title:'Fixture',issue:'Test',tags:[],text:'Synthetic test content'}];
    await db.exec(buildSeedSql(null,example));await db.exec(buildSeedSql(null,example));
    assert.equal((await db.query("select count(*) as n from public.works where id='demo-benvenuto'")).rows[0].n,1);
  });
 } finally {await db.close();}
});
