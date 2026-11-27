-- Run once in a NEW, dedicated Supabase project's SQL editor. No service-role key is needed by the app.
begin;
create table public.vanity_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.vanity_accounts enable row level security;
create policy "Invited account reads itself" on public.vanity_accounts for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.vanity_accounts from anon, authenticated;
grant select on public.vanity_accounts to authenticated;

create table public.vanity_documents (
  user_id uuid not null references public.vanity_accounts(user_id) on delete cascade,
  kind text not null check (kind in ('collection','drafts')),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 5000000),
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id,kind)
);
alter table public.vanity_documents enable row level security;
create policy "Read own documents" on public.vanity_documents for select to authenticated
using (user_id = (select auth.uid()) and exists(select 1 from public.vanity_accounts a where a.user_id = (select auth.uid())));
-- Writes are exclusively through the checked, compare-and-swap function below.
revoke all on public.vanity_documents from anon, authenticated;
grant select on public.vanity_documents to authenticated;

create function public.save_vanity_document(document_kind text, document_payload jsonb, expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_revision bigint;
begin
  if uid is null or not exists(select 1 from public.vanity_accounts where user_id = uid) then
    raise exception 'Invitation required' using errcode='42501';
  end if;
  if document_kind not in ('collection','drafts') or document_payload is null or jsonb_typeof(document_payload) <> 'object' then
    raise exception 'Invalid document' using errcode='22023';
  end if;
  insert into public.vanity_documents(user_id,kind) values(uid,document_kind) on conflict do nothing;
  select revision into current_revision from public.vanity_documents where user_id=uid and kind=document_kind for update;
  if current_revision <> expected_revision then raise exception 'Collection changed on another device' using errcode='40001'; end if;
  update public.vanity_documents set payload=document_payload, revision=revision+1, updated_at=now() where user_id=uid and kind=document_kind;
  return current_revision+1;
end;
$$;
revoke all on function public.save_vanity_document(text,jsonb,bigint) from public, anon;
grant execute on function public.save_vanity_document(text,jsonb,bigint) to authenticated;

create table public.vanity_recognition_usage (
  user_id uuid not null references public.vanity_accounts(user_id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key(user_id,day)
);
alter table public.vanity_recognition_usage enable row level security;
revoke all on public.vanity_recognition_usage from anon, authenticated;
create function public.take_vanity_recognition() returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); used integer;
begin
  if uid is null or not exists(select 1 from public.vanity_accounts where user_id=uid) then raise exception 'Invitation required' using errcode='42501'; end if;
  insert into public.vanity_recognition_usage(user_id,day,count) values(uid,(now() at time zone 'utc')::date,1)
    on conflict(user_id,day) do update set count=public.vanity_recognition_usage.count+1 where public.vanity_recognition_usage.count<40
    returning count into used;
  return used is not null;
end;
$$;
revoke all on function public.take_vanity_recognition() from public, anon;
grant execute on function public.take_vanity_recognition() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vanity-photos','vanity-photos',false,3000000,array['image/jpeg','image/png','image/webp']);
create policy "Read own vanity photos" on storage.objects for select to authenticated using (
 bucket_id='vanity-photos' and (storage.foldername(name))[1]=(select auth.uid()::text)
 and exists(select 1 from public.vanity_accounts where user_id=(select auth.uid()))
);
create policy "Upload own vanity photos" on storage.objects for insert to authenticated with check (
 bucket_id='vanity-photos' and (storage.foldername(name))[1]=(select auth.uid()::text)
 and exists(select 1 from public.vanity_accounts where user_id=(select auth.uid()))
);
create policy "Delete own vanity photos" on storage.objects for delete to authenticated using (
 bucket_id='vanity-photos' and (storage.foldername(name))[1]=(select auth.uid()::text)
 and exists(select 1 from public.vanity_accounts where user_id=(select auth.uid()))
);
commit;

-- After creating each approved Auth user via the dashboard, explicitly grant access:
-- insert into public.vanity_accounts(user_id)
-- select id from auth.users where lower(email)=lower('REPLACE_WITH_IZZY_EMAIL') on conflict do nothing;
