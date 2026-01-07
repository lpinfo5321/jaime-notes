-- Jaime Notes - Schema (Supabase)
-- Pega este archivo completo en Supabase > SQL Editor y ejecútalo.

create extension if not exists pgcrypto;

-- Updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Templates
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_templates_updated_at on public.templates;
create trigger set_templates_updated_at
before update on public.templates
for each row execute function public.set_updated_at();

-- Notes (cards/records)
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  template_id uuid references public.templates(id) on delete set null,
  template_snapshot jsonb,
  values jsonb,
  tags text[] not null default '{}'::text[],
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_notes_updated_at on public.notes;
create trigger set_notes_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

create index if not exists notes_user_updated_at_idx
on public.notes (user_id, updated_at desc);

create index if not exists notes_tags_gin_idx
on public.notes using gin (tags);

-- Attachments (metadata; los archivos viven en Storage)
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  path text not null,
  filename text not null,
  mime_type text not null,
  size bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists attachments_note_id_idx
on public.attachments (note_id);

-- RLS
alter table public.templates enable row level security;
alter table public.notes enable row level security;
alter table public.attachments enable row level security;

-- templates policies
drop policy if exists templates_select_own on public.templates;
create policy templates_select_own on public.templates
for select using (auth.uid() = user_id);

drop policy if exists templates_insert_own on public.templates;
create policy templates_insert_own on public.templates
for insert with check (auth.uid() = user_id);

drop policy if exists templates_update_own on public.templates;
create policy templates_update_own on public.templates
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists templates_delete_own on public.templates;
create policy templates_delete_own on public.templates
for delete using (auth.uid() = user_id);

-- notes policies
drop policy if exists notes_select_own on public.notes;
create policy notes_select_own on public.notes
for select using (auth.uid() = user_id);

drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own on public.notes
for insert with check (auth.uid() = user_id);

drop policy if exists notes_update_own on public.notes;
create policy notes_update_own on public.notes
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notes_delete_own on public.notes;
create policy notes_delete_own on public.notes
for delete using (auth.uid() = user_id);

-- attachments policies (metadata)
drop policy if exists attachments_select_own on public.attachments;
create policy attachments_select_own on public.attachments
for select using (auth.uid() = user_id);

drop policy if exists attachments_insert_own on public.attachments;
create policy attachments_insert_own on public.attachments
for insert with check (auth.uid() = user_id);

drop policy if exists attachments_update_own on public.attachments;
create policy attachments_update_own on public.attachments
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists attachments_delete_own on public.attachments;
create policy attachments_delete_own on public.attachments
for delete using (auth.uid() = user_id);

-- Storage (bucket: attachments)
-- 1) Crea un bucket llamado: attachments (privado)
-- 2) Estas policies asumen que guardamos archivos con path: <userId>/<noteId>/<archivo>

-- SELECT (descargar/ver)
drop policy if exists storage_attachments_select_own on storage.objects;
create policy storage_attachments_select_own on storage.objects
for select
using (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- INSERT (subir)
drop policy if exists storage_attachments_insert_own on storage.objects;
create policy storage_attachments_insert_own on storage.objects
for insert
with check (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- UPDATE (renombrar/mover - opcional)
drop policy if exists storage_attachments_update_own on storage.objects;
create policy storage_attachments_update_own on storage.objects
for update
using (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- DELETE (borrar)
drop policy if exists storage_attachments_delete_own on storage.objects;
create policy storage_attachments_delete_own on storage.objects
for delete
using (
  bucket_id = 'attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

