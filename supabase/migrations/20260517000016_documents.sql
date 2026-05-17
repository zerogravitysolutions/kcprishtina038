-- 0016 — Club documents (PDFs).
--
-- Stores the club's official paperwork (statute, decisions, minutes,
-- declarations, certificates). Files live in the `media` Storage bucket
-- under the `docs/` prefix; this table holds the metadata + the
-- category/ordering/visibility used to render the public /documents
-- page and the admin CRUD.
--
-- PDF-only enforced at the DB level via a CHECK on mime_type so the
-- admin upload form can stay simple — the database is the
-- backstop.

create type public.document_category as enum (
  'regulations',   -- 1 - Rregulloret (statute, by-laws, internal regs)
  'decisions',     -- 2 - Vendimet (board/assembly decisions)
  'minutes',       -- 4 - Procesverbalet (assembly + meeting minutes)
  'declarations',  -- 6 - Deklaratat (signed declarations to FÇK/UCI)
  'certificates',  -- 7 - Vërtetimet (tax & registration certificates)
  'other'          -- 5 - Dokumente te tjera (everything else)
);

create type public.document_visibility as enum (
  'public',  -- visible on /documents to anonymous visitors
  'members', -- requires authenticated member status
  'admin'    -- admin-only (internal docs)
);

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique
                    check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  title           text not null,
  category        public.document_category not null,
  storage_path    text not null unique,
  filename        text not null,
  mime_type       text not null default 'application/pdf'
                    check (mime_type = 'application/pdf'),
  byte_size       bigint,
  page_count      int,
  description     text,
  effective_date  date,
  display_order   int  not null default 100,
  visibility      public.document_visibility not null default 'public',
  uploaded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index documents_category_idx on public.documents(category, display_order);
create index documents_visibility_idx on public.documents(visibility, effective_date desc nulls last);
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- RLS: public read for 'public' rows; members for 'members' rows; admin/editor write.
alter table public.documents enable row level security;

create policy documents_select_public on public.documents
  for select using (visibility = 'public');

create policy documents_select_members on public.documents
  for select to authenticated
  using (
    visibility = 'members'
    and exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'active')
  );

create policy documents_select_admin on public.documents
  for select to authenticated
  using (public.has_role(array['admin','editor','staff']::public.user_role[]));

create policy documents_write_admin on public.documents
  for all to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));
