-- =====================================================================
--  SEBRAE - Gestão de OS  |  Script de melhorias  (001_melhorias.sql)
-- ---------------------------------------------------------------------
--  Como usar: Supabase > SQL Editor > New query > cole TUDO e clique RUN.
--  O script é IDEMPOTENTE: pode ser executado mais de uma vez sem erro.
--
--  PARTE 1  -> estrutura, funções, auditoria e policies (rodar agora)
--  PARTE 2  -> ativação do RLS nas tabelas antigas (rodar quando quiser)
-- =====================================================================

begin;

-- =====================================================================
-- PARTE 1.1  ordens_servico: novas colunas
-- =====================================================================
alter table public.ordens_servico
  add column if not exists status_conta_azul text not null default 'Pendente',
  add column if not exists updated_at        timestamptz,
  add column if not exists updated_by_email  text,
  add column if not exists created_by_email  text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ordens_servico_status_conta_azul_check'
  ) then
    alter table public.ordens_servico
      add constraint ordens_servico_status_conta_azul_check
      check (status_conta_azul in ('Pendente', 'Concluído'));
  end if;
end $$;

-- =====================================================================
-- PARTE 1.2  Integridade: FKs com ON DELETE CASCADE + índices
-- =====================================================================
-- Remove registros "órfãos" (detalhes/responsáveis cuja OS já não existe).
-- Eles não aparecem em nenhuma tela e impediriam a criação da FK.
delete from public.os_detalhes d
 where not exists (select 1 from public.ordens_servico o where o.numero_os = d.numero_os);
delete from public.os_responsaveis r
 where not exists (select 1 from public.ordens_servico o where o.numero_os = r.numero_os);

-- Remove qualquer FK existente entre as tabelas filhas e ordens_servico...
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
      from pg_constraint c
     where c.contype = 'f'
       and c.conrelid in ('public.os_detalhes'::regclass, 'public.os_responsaveis'::regclass)
       and c.confrelid = 'public.ordens_servico'::regclass
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- ...e recria com CASCADE (excluir a OS exclui seus detalhes/responsáveis).
alter table public.os_detalhes
  add constraint os_detalhes_numero_os_fkey
  foreign key (numero_os) references public.ordens_servico(numero_os)
  on delete cascade on update cascade;

alter table public.os_responsaveis
  add constraint os_responsaveis_numero_os_fkey
  foreign key (numero_os) references public.ordens_servico(numero_os)
  on delete cascade on update cascade;

create index if not exists idx_os_detalhes_numero_os     on public.os_detalhes(numero_os);
create index if not exists idx_os_responsaveis_numero_os on public.os_responsaveis(numero_os);
create index if not exists idx_ordens_servico_updated_at on public.ordens_servico(updated_at desc);

-- =====================================================================
-- PARTE 1.3  Tabela de LOTES (valores editáveis pelas Configurações)
-- =====================================================================
create table if not exists public.lotes (
  codigo            text primary key,                 -- ex.: 'lote2' (é o que fica salvo em ordens_servico.lote)
  nome              text not null,                    -- ex.: 'Lote 2'
  valor_diaria      numeric(12,2) not null default 0 check (valor_diaria >= 0),
  valor_meia_diaria numeric(12,2) not null default 0 check (valor_meia_diaria >= 0),
  ativo             boolean not null default true,
  ordem             integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

insert into public.lotes (codigo, nome, valor_diaria, valor_meia_diaria, ordem) values
  ('lote2',  'Lote 2',  611.04, 297.09, 2),
  ('lote5',  'Lote 5',  841.04, 683.35, 5),
  ('lote7',  'Lote 7',  737.46, 368.73, 7),
  ('lote8',  'Lote 8',  623.07, 316.05, 8),
  ('lote10', 'Lote 10', 747.99, 316.05, 10),
  ('lote11', 'Lote 11', 632.11, 204.38, 11)
on conflict (codigo) do nothing;

-- =====================================================================
-- PARTE 1.4  Tabela de CONFIGURAÇÕES (chave / valor)
-- =====================================================================
create table if not exists public.configuracoes (
  chave      text primary key,
  valor      jsonb not null,
  descricao  text,
  updated_at timestamptz not null default now()
);

insert into public.configuracoes (chave, valor, descricao) values
  ('aliquota_iss',        '0.1633'::jsonb, 'Alíquota de ISS aplicada sobre o valor unitário total (0.1633 = 16,33%)'),
  ('dias_edicao_recente', '5'::jsonb,      'Janela (em dias) para marcar uma OS como "editada recentemente"')
on conflict (chave) do nothing;

-- =====================================================================
-- PARTE 1.5  Tabela de LOGS DE AUDITORIA
-- =====================================================================
create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  entidade      text not null check (entidade in ('os', 'lote', 'config')),
  registro_id   text not null,
  acao          text not null check (acao in ('CRIACAO', 'EDICAO', 'EXCLUSAO')),
  dados_antigos jsonb,
  dados_novos   jsonb,
  user_id       uuid,
  user_email    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_registro   on public.audit_logs(entidade, registro_id);

-- =====================================================================
-- PARTE 1.6  Funções internas (não expostas ao front)
-- =====================================================================

-- Registra um log (usado pelas RPCs e triggers).
create or replace function public.fn_registrar_log(
  p_entidade text, p_registro_id text, p_acao text, p_antigo jsonb, p_novo jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (entidade, registro_id, acao, dados_antigos, dados_novos, user_id, user_email)
  values (p_entidade, p_registro_id, p_acao, p_antigo, p_novo, auth.uid(), auth.jwt() ->> 'email');
end;
$$;

-- Foto completa de uma OS (cabeçalho + detalhes + responsáveis) em JSON.
create or replace function public.fn_snapshot_os(p_numero_os text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_os jsonb;
begin
  select to_jsonb(o) - array['created_at', 'updated_at', 'updated_by_email', 'created_by_email']
    into v_os
    from public.ordens_servico o
   where o.numero_os = p_numero_os;

  if v_os is null then
    return null;
  end if;

  return v_os || jsonb_build_object(
    'detalhes', coalesce((
      select jsonb_agg(to_jsonb(d) - array['id', 'created_at', 'numero_os']
                       order by d.data_servico nulls last, d.horario_gravacao nulls last, d.responsavel_servico)
        from public.os_detalhes d
       where d.numero_os = p_numero_os), '[]'::jsonb),
    'responsaveis', coalesce((
      select jsonb_agg(to_jsonb(r) - array['id', 'created_at', 'numero_os'] order by r.nome)
        from public.os_responsaveis r
       where r.numero_os = p_numero_os), '[]'::jsonb)
  );
end;
$$;

-- Atualiza updated_at automaticamente (lotes / configuracoes).
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Auditoria automática de lotes e configurações.
create or replace function public.fn_audit_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entidade text := case tg_table_name when 'lotes' then 'lote' else 'config' end;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id  text  := coalesce(v_new ->> 'codigo', v_new ->> 'chave', v_old ->> 'codigo', v_old ->> 'chave');
begin
  if tg_op = 'UPDATE'
     and (v_old - array['updated_at', 'created_at']) = (v_new - array['updated_at', 'created_at']) then
    return new; -- nada mudou de fato
  end if;

  perform public.fn_registrar_log(
    v_entidade, v_id,
    case tg_op when 'INSERT' then 'CRIACAO' when 'UPDATE' then 'EDICAO' else 'EXCLUSAO' end,
    v_old - array['updated_at', 'created_at'],
    v_new - array['updated_at', 'created_at']
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_lotes_updated_at on public.lotes;
create trigger trg_lotes_updated_at before update on public.lotes
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_configuracoes_updated_at on public.configuracoes;
create trigger trg_configuracoes_updated_at before update on public.configuracoes
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_lotes_audit on public.lotes;
create trigger trg_lotes_audit after insert or update or delete on public.lotes
  for each row execute function public.fn_audit_config();

drop trigger if exists trg_configuracoes_audit on public.configuracoes;
create trigger trg_configuracoes_audit after insert or update or delete on public.configuracoes
  for each row execute function public.fn_audit_config();

-- =====================================================================
-- PARTE 1.7  RPC: salvar_os  (tudo em UMA transação + log consolidado)
-- ---------------------------------------------------------------------
--  Chamada no front:
--    supabase.rpc('salvar_os', { p_os, p_detalhes, p_responsaveis, p_is_novo })
-- =====================================================================
create or replace function public.salvar_os(
  p_os           jsonb,
  p_detalhes     jsonb   default '[]'::jsonb,
  p_responsaveis jsonb   default '[]'::jsonb,
  p_is_novo      boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero text    := nullif(trim(p_os ->> 'numero_os'), '');
  v_email  text    := auth.jwt() ->> 'email';
  v_existe boolean;
  v_antes  jsonb;
  v_depois jsonb;
  v_acao   text    := null;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if v_numero is null then
    raise exception 'O número da OS é obrigatório.' using errcode = '22023';
  end if;

  select exists (select 1 from public.ordens_servico where numero_os = v_numero) into v_existe;

  if p_is_novo and v_existe then
    raise exception 'Já existe uma OS com o número %.', v_numero using errcode = '23505';
  end if;

  if not p_is_novo and not v_existe then
    raise exception 'A OS % não foi encontrada.', v_numero using errcode = 'P0002';
  end if;

  v_antes := public.fn_snapshot_os(v_numero);

  -- Cabeçalho da OS --------------------------------------------------
  if v_existe then
    update public.ordens_servico set
      lote                 = nullif(p_os ->> 'lote', ''),
      endereco             = p_os ->> 'endereco',
      adicionais           = p_os ->> 'adicionais',
      observacoes          = p_os ->> 'observacoes',
      valor_unitario_total = nullif(p_os ->> 'valor_unitario_total', '')::numeric,
      curso_responsavel    = nullif(p_os ->> 'curso_responsavel', '')::numeric,
      nfs_e                = p_os ->> 'nfs_e',
      valor_iss            = nullif(p_os ->> 'valor_iss', '')::numeric,
      valor_hl             = nullif(p_os ->> 'valor_hl', '')::numeric,
      lucro_previsto       = nullif(p_os ->> 'lucro_previsto', '')::numeric,
      status_conta_azul    = coalesce(nullif(p_os ->> 'status_conta_azul', ''), 'Pendente')
    where numero_os = v_numero;
  else
    insert into public.ordens_servico (
      numero_os, lote, endereco, adicionais, observacoes, valor_unitario_total,
      curso_responsavel, nfs_e, valor_iss, valor_hl, lucro_previsto,
      status_conta_azul, created_by_email
    ) values (
      v_numero,
      nullif(p_os ->> 'lote', ''),
      p_os ->> 'endereco',
      p_os ->> 'adicionais',
      p_os ->> 'observacoes',
      nullif(p_os ->> 'valor_unitario_total', '')::numeric,
      nullif(p_os ->> 'curso_responsavel', '')::numeric,
      p_os ->> 'nfs_e',
      nullif(p_os ->> 'valor_iss', '')::numeric,
      nullif(p_os ->> 'valor_hl', '')::numeric,
      nullif(p_os ->> 'lucro_previsto', '')::numeric,
      coalesce(nullif(p_os ->> 'status_conta_azul', ''), 'Pendente'),
      v_email
    );
  end if;

  -- Detalhes (substitui o conjunto inteiro, inclusive quando vier vazio) ----
  delete from public.os_detalhes where numero_os = v_numero;

  insert into public.os_detalhes (
    numero_os, valor_unitario, data_servico, responsavel_servico,
    horario_gravacao, horario_saida, servico, meia_diaria
  )
  select
    v_numero,
    nullif(d ->> 'valor_unitario', '')::numeric,
    nullif(d ->> 'data_servico', '')::date,
    d ->> 'responsavel_servico',
    nullif(d ->> 'horario_gravacao', '')::time,
    nullif(d ->> 'horario_saida', '')::time,
    d ->> 'servico',
    d ->> 'meia_diaria'
  from jsonb_array_elements(coalesce(p_detalhes, '[]'::jsonb)) as d;

  -- Responsáveis ----------------------------------------------------------
  delete from public.os_responsaveis where numero_os = v_numero;

  insert into public.os_responsaveis (
    numero_os, nome, valor_freelance, reembolso_conducao, reembolso_alimentacao,
    reembolso_hospedagem, agendamento, status_pagamento, data_pagamento
  )
  select
    v_numero,
    r ->> 'nome',
    nullif(r ->> 'valor_freelance', '')::numeric,
    nullif(r ->> 'reembolso_conducao', '')::numeric,
    nullif(r ->> 'reembolso_alimentacao', '')::numeric,
    nullif(r ->> 'reembolso_hospedagem', '')::numeric,
    nullif(r ->> 'agendamento', '')::date,
    nullif(r ->> 'status_pagamento', ''),
    nullif(r ->> 'data_pagamento', '')::date
  from jsonb_array_elements(coalesce(p_responsaveis, '[]'::jsonb)) as r;

  -- Auditoria -------------------------------------------------------------
  v_depois := public.fn_snapshot_os(v_numero);

  if v_antes is null then
    v_acao := 'CRIACAO';
  elsif v_antes is distinct from v_depois then
    v_acao := 'EDICAO';
    update public.ordens_servico
       set updated_at = now(), updated_by_email = v_email
     where numero_os = v_numero;
  end if;

  if v_acao is not null then
    perform public.fn_registrar_log('os', v_numero, v_acao, v_antes, v_depois);
  end if;

  return jsonb_build_object('numero_os', v_numero, 'acao', coalesce(v_acao, 'SEM_ALTERACAO'));
end;
$$;

-- =====================================================================
-- PARTE 1.8  RPC: excluir_os  (guarda a foto completa no log antes de excluir)
-- =====================================================================
create or replace function public.excluir_os(p_numero_os text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  v_antes := public.fn_snapshot_os(p_numero_os);
  if v_antes is null then
    raise exception 'A OS % não foi encontrada.', p_numero_os using errcode = 'P0002';
  end if;

  delete from public.os_detalhes     where numero_os = p_numero_os;
  delete from public.os_responsaveis where numero_os = p_numero_os;
  delete from public.ordens_servico  where numero_os = p_numero_os;

  perform public.fn_registrar_log('os', p_numero_os, 'EXCLUSAO', v_antes, null);
end;
$$;

-- =====================================================================
-- PARTE 1.9  Permissões das funções
-- =====================================================================
-- Internas: ninguém do front pode chamar diretamente.
revoke all on function public.fn_registrar_log(text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fn_snapshot_os(text)                             from public, anon, authenticated;
revoke all on function public.fn_audit_config()                                from public, anon, authenticated;

-- RPCs públicas: somente usuários logados.
revoke all     on function public.salvar_os(jsonb, jsonb, jsonb, boolean) from public, anon;
grant  execute on function public.salvar_os(jsonb, jsonb, jsonb, boolean) to authenticated;
revoke all     on function public.excluir_os(text)                        from public, anon;
grant  execute on function public.excluir_os(text)                        to authenticated;

-- Logs: o front só pode LER. Escrita apenas via funções acima.
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;
grant  select                           on public.audit_logs to authenticated;

-- =====================================================================
-- PARTE 1.10  Policies RLS (já criadas; só passam a valer quando o RLS
--             da tabela estiver ATIVO)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['ordens_servico', 'os_detalhes', 'os_responsaveis', 'lotes', 'configuracoes'] loop
    execute format('drop policy if exists %I on public.%I', 'authenticated_full_access', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'authenticated_full_access', t
    );
  end loop;
end $$;

drop policy if exists authenticated_read_logs on public.audit_logs;
create policy authenticated_read_logs on public.audit_logs
  for select to authenticated using (true);

-- Tabelas NOVAS já nascem protegidas (as policies acima liberam o usuário logado).
alter table public.lotes         enable row level security;
alter table public.configuracoes enable row level security;
alter table public.audit_logs    enable row level security;

commit;

-- =====================================================================
-- PARTE 2  ATIVAR RLS NAS TABELAS ANTIGAS
-- ---------------------------------------------------------------------
-- Quando quiser ativar, descomente as 3 linhas abaixo e rode.
-- As policies já existem (Parte 1.10): usuários logados continuam com
-- acesso total e requisições anônimas passam a receber lista vazia.
-- =====================================================================
-- alter table public.ordens_servico  enable row level security;
-- alter table public.os_detalhes     enable row level security;
-- alter table public.os_responsaveis enable row level security;


-- =====================================================================
-- (Opcional) Conferência rápida após rodar:
-- select codigo, nome, valor_diaria, valor_meia_diaria from public.lotes order by ordem;
-- select * from public.configuracoes;
-- select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- =====================================================================
