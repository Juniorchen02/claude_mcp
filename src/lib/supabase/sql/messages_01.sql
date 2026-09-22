create table messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  content text not null
);

-- RLS aktif tanpa policy = tidak ada akses publik.
-- Server kita memakai service_role key yang melewati RLS.
alter table messages enable row level security;