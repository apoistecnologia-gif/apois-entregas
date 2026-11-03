-- PROPOSTA DE ESQUEMA, NÃO É MIGRAÇÃO APLICADA.
-- NÃO EXECUTAR EM PRODUÇÃO. Gerar migration com supabase CLI em ambiente de homologação,
-- verificar RLS com pgTAP e aprovar os textos jurídicos ANTES de habilitar qualquer documento.
-- Preserva integralmente public.legal_acceptances e os usuários existentes.

create table if not exists public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_key text not null check (document_key in (
    'general_terms', 'privacy_notice', 'courier_contract',
    'merchant_contract', 'customer_delivery_terms', 'safety_policy', 'cancellation_policy'
  )),
  audience text not null check (audience in ('all','customer','courier','merchant')),
  version text not null check (char_length(version) between 1 and 80),
  content_text text not null check (char_length(content_text) > 0),
  content_sha256 text generated always as (encode(sha256(convert_to(content_text, 'UTF8')), 'hex')) stored,
  status text not null default 'draft' check (status in ('draft','published','retired')),
  approved_at timestamptz,
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'published' or (approved_at is not null and effective_at is not null)),
  unique (document_key, audience, version)
);

-- Apenas uma versão de cada documento/papel pode permanecer publicada.
create unique index if not exists legal_one_published_version_per_audience
on public.legal_document_versions(document_key, audience)
where status = 'published';

-- Publicações jamais podem ter texto/versionamento substituídos.
create or replace function public.prevent_published_legal_document_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if tg_op = 'DELETE' and old.status in ('published','retired') then
    raise exception 'published legal documents cannot be deleted';
  end if;
  if tg_op = 'UPDATE' and old.status in ('published','retired') then
    if new.content_text is distinct from old.content_text
       or new.document_key is distinct from old.document_key
       or new.audience is distinct from old.audience
       or new.version is distinct from old.version
       or new.approved_at is distinct from old.approved_at
       or new.effective_at is distinct from old.effective_at
       or new.created_at is distinct from old.created_at
       or new.id is distinct from old.id
       or new.status not in ('published', 'retired') then
      raise exception 'published legal document is immutable';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$fn$;

drop trigger if exists legal_document_immutability on public.legal_document_versions;
create trigger legal_document_immutability
before update or delete on public.legal_document_versions
for each row execute function public.prevent_published_legal_document_mutation();

create table if not exists public.legal_acceptance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_version_id uuid not null references public.legal_document_versions(id) on delete restrict,
  action text not null check (action in ('accepted','acknowledged')),
  occurred_at timestamptz not null default now(),
  request_id uuid not null,
  client_app_version text check (client_app_version is null or length(client_app_version) <= 64),
  source text not null default 'edge_function' check (source = 'edge_function'),
  created_at timestamptz not null default now(),
  unique (user_id, document_version_id, action),
  unique (user_id, request_id)
);

-- Eventos não podem ser alterados pela API do usuário. O controle de INSERT,
-- UPDATE e DELETE é feito por privilégios mínimos, sem conceder essas operações
-- a anon/authenticated. Exclusão excepcional por dever legal, retenção vencida
-- ou apagamento de conta será executada por procedimento administrativo auditado.
-- Não impor trigger de DELETE que impossibilite o CASCADE de auth.users.

create index if not exists legal_acceptance_events_user_idx
on public.legal_acceptance_events(user_id, occurred_at desc);

create index if not exists legal_document_versions_live_idx
on public.legal_document_versions(audience, document_key, status, effective_at);

alter table public.legal_document_versions enable row level security;
alter table public.legal_acceptance_events enable row level security;

revoke all on table public.legal_document_versions from anon, authenticated;
revoke all on table public.legal_acceptance_events from anon, authenticated;

grant select on table public.legal_document_versions to anon, authenticated;
grant select on table public.legal_acceptance_events to authenticated;

drop policy if exists "Read published legal documents" on public.legal_document_versions;
create policy "Read published legal documents"
on public.legal_document_versions
for select to anon, authenticated
using (status = 'published' and effective_at <= now());

-- Versões retiradas continuam disponíveis somente para titulares que já
-- possuem evento daquela versão. Isso evita expor drafts e conserva prova histórica.
drop policy if exists "Read own previously accepted legal documents" on public.legal_document_versions;
create policy "Read own previously accepted legal documents"
on public.legal_document_versions
for select to authenticated
using (
  status = 'retired'
  and exists (
    select 1 from public.legal_acceptance_events e
    where e.document_version_id = id and e.user_id = (select auth.uid())
  )
);

drop policy if exists "Users read own legal event records" on public.legal_acceptance_events;
create policy "Users read own legal event records"
on public.legal_acceptance_events
for select to authenticated
using (user_id = (select auth.uid()));

-- Nenhum INSERT/UPDATE/DELETE é concedido a anon/authenticated.
-- O Edge Function usa service_role somente no servidor, verificando JWT e função do usuário.
-- Não publicar documento algum nesta etapa: a tabela inicia vazia.
-- Antes de aprovar uma versão posterior, marcar a atual como retired e testar
-- se o titular pode visualizar o conteúdo histórico através da RLS.
-- Revisar retenção, exclusão e proteção de direitos antes de aplicar.
