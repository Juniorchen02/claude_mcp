create table files (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  name text not null,
  mime_type text not null,
  size integer not null
);

-- RLS aktif tanpa policy = tidak ada akses publik.
-- Server kita memakai service_role key yang melewati RLS.
alter table files enable row level security;