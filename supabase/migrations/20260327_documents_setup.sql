-- Tabla documents
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  path        text not null,
  mime_type   text not null default '',
  size        bigint not null default 0,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.documents enable row level security;

do $$ begin
  create policy "docs select" on public.documents for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "docs insert" on public.documents for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "docs update" on public.documents for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "docs delete" on public.documents for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger documents_updated_at before update on public.documents
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

-- Bucket de storage
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Políticas de storage
do $$ begin
  create policy "docs storage insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'documents');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "docs storage select" on storage.objects
    for select to authenticated
    using (bucket_id = 'documents');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "docs storage delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'documents');
exception when duplicate_object then null; end $$;
