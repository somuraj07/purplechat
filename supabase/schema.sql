create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  author_id text not null check (author_id in ('you', 'partner')),
  author_name text not null,
  body text,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  file_name text,
  reply_to_id uuid references public.messages(id) on delete set null,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint messages_need_content check (
    body is not null or media_url is not null
  )
);

alter table public.messages
add column if not exists updated_at timestamptz not null default now();

alter table public.messages
add column if not exists reply_to_id uuid references public.messages(id) on delete set null;

alter table public.messages
add column if not exists reactions jsonb not null default '{}'::jsonb;

alter table public.messages
add column if not exists edited_at timestamptz;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.body is distinct from old.body then
    new.edited_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
before update on public.messages
for each row
execute function public.set_updated_at();

alter table public.messages enable row level security;

drop policy if exists "PurpleChat can read messages" on public.messages;
create policy "PurpleChat can read messages"
on public.messages for select
to anon
using (true);

drop policy if exists "PurpleChat can create messages" on public.messages;
create policy "PurpleChat can create messages"
on public.messages for insert
to anon
with check (
  author_id in ('you', 'partner')
  and (body is not null or media_url is not null)
);

drop policy if exists "PurpleChat can edit messages" on public.messages;
create policy "PurpleChat can edit messages"
on public.messages for update
to anon
using (author_id in ('you', 'partner'))
with check (
  author_id in ('you', 'partner')
  and (body is not null or media_url is not null)
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "PurpleChat can upload media" on storage.objects;
create policy "PurpleChat can upload media"
on storage.objects for insert
to anon
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] in ('you', 'partner')
);

drop policy if exists "PurpleChat can read media" on storage.objects;
create policy "PurpleChat can read media"
on storage.objects for select
to anon
using (bucket_id = 'chat-media');
