-- Tabla de documentos (librería general, no ligada a notas específicas)
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

create index if not exists documents_user_id_idx on public.documents(user_id);

alter table public.documents enable row level security;

create policy "documents: owner select" on public.documents for select using (auth.uid() = user_id);
create policy "documents: owner insert" on public.documents for insert with check (auth.uid() = user_id);
create policy "documents: owner update" on public.documents for update using (auth.uid() = user_id);
create policy "documents: owner delete" on public.documents for delete using (auth.uid() = user_id);

create trigger documents_updated_at
  before update on public.documents
  for each row execute procedure public.set_updated_at();
