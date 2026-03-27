-- Tabla de contactos
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  phones      text[] not null default '{}',
  email       text,
  company     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Índices
create index if not exists contacts_user_id_idx on public.contacts(user_id);
create index if not exists contacts_name_idx    on public.contacts using gin(to_tsvector('simple', name));

-- RLS
alter table public.contacts enable row level security;

create policy "contacts: owner select"
  on public.contacts for select
  using (auth.uid() = user_id);

create policy "contacts: owner insert"
  on public.contacts for insert
  with check (auth.uid() = user_id);

create policy "contacts: owner update"
  on public.contacts for update
  using (auth.uid() = user_id);

create policy "contacts: owner delete"
  on public.contacts for delete
  using (auth.uid() = user_id);

-- Trigger para updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute procedure public.set_updated_at();
