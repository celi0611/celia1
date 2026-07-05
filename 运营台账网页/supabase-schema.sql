create table if not exists public.ledgers (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ledgers enable row level security;

drop policy if exists "service role can manage ledgers" on public.ledgers;
create policy "service role can manage ledgers"
on public.ledgers
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into public.ledgers (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
