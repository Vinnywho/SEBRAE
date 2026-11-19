-- =====================================================================
--  SEBRAE - Gestão de OS  |  Auditoria de Lotes em Massa e Função Desfazer
--  Arquivo: 009_audit_bulk_and_undo.sql
-- ---------------------------------------------------------------------
--  Como usar: Supabase > SQL Editor > New query > Cole tudo e clique RUN.
--  O script é idempotente (pode ser executado mais de uma vez com segurança).
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. ATUALIZAR TABELA audit_logs (novas entidades, ação DESFAZER e controle de reversão)
-- =====================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.audit_logs'::regclass
       AND c.contype = 'c'
       AND (
         pg_get_constraintdef(c.oid) ILIKE '%entidade%'
         OR pg_get_constraintdef(c.oid) ILIKE '%acao%'
       )
  LOOP
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_entidade_check
  CHECK (entidade IN ('os', 'lote', 'config', 'pagamento'));

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_acao_check
  CHECK (acao IN ('CRIACAO', 'EDICAO', 'EXCLUSAO', 'DESFAZER'));

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS desfeito           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS desfeito_em        timestamptz,
  ADD COLUMN IF NOT EXISTS desfeito_por_email text,
  ADD COLUMN IF NOT EXISTS desfeito_log_id    bigint REFERENCES public.audit_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entidade_created
  ON public.audit_logs (entidade, created_at DESC);

-- =====================================================================
-- 2. FUNÇÃO INTERNA AUXILIAR DE LOG COM RETORNO DE ID
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_registrar_log_ret(
  p_entidade text,
  p_registro_id text,
  p_acao text,
  p_antigo jsonb,
  p_novo jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.audit_logs (
    entidade, registro_id, acao, dados_antigos, dados_novos, user_id, user_email
  ) VALUES (
    p_entidade, p_registro_id, p_acao, p_antigo, p_novo, auth.uid(), auth.jwt() ->> 'email'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Atualiza fn_audit_config para respeitar skip durante operação de Desfazer
CREATE OR REPLACE FUNCTION public.fn_audit_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entidade text := CASE tg_table_name WHEN 'lotes' THEN 'lote' ELSE 'config' END;
  v_old jsonb := CASE WHEN tg_op IN ('UPDATE', 'DELETE') THEN to_jsonb(old) END;
  v_new jsonb := CASE WHEN tg_op IN ('INSERT', 'UPDATE') THEN to_jsonb(new) END;
  v_id  text  := coalesce(v_new ->> 'codigo', v_new ->> 'chave', v_old ->> 'codigo', v_old ->> 'chave');
BEGIN
  IF current_setting('app.skip_config_audit', true) = '1' THEN
    RETURN coalesce(new, old);
  END IF;

  IF tg_op = 'UPDATE'
     AND (v_old - array['updated_at', 'created_at']) = (v_new - array['updated_at', 'created_at']) THEN
    RETURN new;
  END IF;

  PERFORM public.fn_registrar_log(
    v_entidade, v_id,
    CASE tg_op WHEN 'INSERT' THEN 'CRIACAO' WHEN 'UPDATE' THEN 'EDICAO' ELSE 'EXCLUSAO' END,
    v_old - array['updated_at', 'created_at'],
    v_new - array['updated_at', 'created_at']
  );

  RETURN coalesce(new, old);
END;
$$;

-- Atualiza fn_snapshot_os com ordenação determinística de responsáveis (r.nome, r.id)
CREATE OR REPLACE FUNCTION public.fn_snapshot_os(p_numero_os text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os jsonb;
BEGIN
  SELECT to_jsonb(o) - array['created_at', 'updated_at', 'updated_by_email', 'created_by_email']
    INTO v_os
    FROM public.ordens_servico o
   WHERE o.numero_os = p_numero_os;

  IF v_os IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_os || jsonb_build_object(
    'detalhes', coalesce((
      SELECT jsonb_agg(to_jsonb(d) - array['id', 'created_at', 'numero_os']
                       ORDER BY d.data_servico NULLS LAST, d.horario_gravacao NULLS LAST, d.responsavel_servico, d.id)
        FROM public.os_detalhes d
       WHERE d.numero_os = p_numero_os), '[]'::jsonb),
    'responsaveis', coalesce((
      SELECT jsonb_agg(to_jsonb(r) - array['id', 'created_at', 'numero_os']
                       ORDER BY r.nome, r.id)
        FROM public.os_responsaveis r
       WHERE r.numero_os = p_numero_os), '[]'::jsonb)
  );
END;
$$;

-- =====================================================================
-- 3. ATUALIZAR salvar_os e excluir_os PARA RETORNAR log_id
-- =====================================================================
CREATE OR REPLACE FUNCTION public.salvar_os(
  p_os           jsonb,
  p_detalhes     jsonb   DEFAULT '[]'::jsonb,
  p_responsaveis jsonb   DEFAULT '[]'::jsonb,
  p_is_novo      boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero text    := nullif(trim(p_os ->> 'numero_os'), '');
  v_email  text    := auth.jwt() ->> 'email';
  v_nome   text    := coalesce(nullif(p_os ->> 'nome_os', ''), p_os ->> 'endereco');
  v_cidade text    := p_os ->> 'cidade';
  v_existe boolean;
  v_antes  jsonb;
  v_depois jsonb;
  v_acao   text    := null;
  v_log_id bigint  := null;
  v_detalhe jsonb;
  v_responsavel jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode = '42501';
  END IF;

  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'O número da OS é obrigatório.' USING errcode = '22023';
  END IF;

  SELECT exists (SELECT 1 FROM public.ordens_servico WHERE numero_os = v_numero) INTO v_existe;

  IF p_is_novo AND v_existe THEN
    RAISE EXCEPTION 'Já existe uma OS com o número %.', v_numero USING errcode = '23505';
  END IF;

  IF NOT p_is_novo AND NOT v_existe THEN
    RAISE EXCEPTION 'A OS % não foi encontrada.', v_numero USING errcode = 'P0002';
  END IF;

  v_antes := public.fn_snapshot_os(v_numero);

  IF v_existe THEN
    UPDATE public.ordens_servico SET
      nome_os              = v_nome,
      cidade               = v_cidade,
      endereco             = v_nome,
      lote                 = nullif(p_os ->> 'lote', ''),
      adicionais           = p_os ->> 'adicionais',
      observacoes          = p_os ->> 'observacoes',
      valor_unitario_total = nullif(p_os ->> 'valor_unitario_total', '')::numeric,
      curso_responsavel    = nullif(p_os ->> 'curso_responsavel', '')::numeric,
      nfs_e                = p_os ->> 'nfs_e',
      valor_iss            = nullif(p_os ->> 'valor_iss', '')::numeric,
      lucro_previsto       = nullif(p_os ->> 'lucro_previsto', '')::numeric,
      status_conta_azul    = coalesce(nullif(p_os ->> 'status_conta_azul', ''), 'Pendente'),
      updated_at           = now(),
      updated_by           = auth.uid(),
      updated_by_email     = v_email
    WHERE numero_os = v_numero;
  ELSE
    INSERT INTO public.ordens_servico (
      numero_os, nome_os, cidade, endereco, lote, adicionais, observacoes, valor_unitario_total,
      curso_responsavel, nfs_e, valor_iss, lucro_previsto, status_conta_azul, created_by_email
    ) VALUES (
      v_numero,
      v_nome,
      v_cidade,
      v_nome,
      nullif(p_os ->> 'lote', ''),
      p_os ->> 'adicionais',
      p_os ->> 'observacoes',
      nullif(p_os ->> 'valor_unitario_total', '')::numeric,
      nullif(p_os ->> 'curso_responsavel', '')::numeric,
      p_os ->> 'nfs_e',
      nullif(p_os ->> 'valor_iss', '')::numeric,
      nullif(p_os ->> 'lucro_previsto', '')::numeric,
      coalesce(nullif(p_os ->> 'status_conta_azul', ''), 'Pendente'),
      v_email
    );
  END IF;

  DELETE FROM public.os_detalhes WHERE numero_os = v_numero;

  FOR v_detalhe IN SELECT * FROM jsonb_array_elements(coalesce(p_detalhes, '[]'::jsonb))
  LOOP
    INSERT INTO public.os_detalhes (
      numero_os, valor_unitario, data_servico, responsavel_servico,
      horario_gravacao, horario_saida, servico, quantidade_diarias
    ) VALUES (
      v_numero,
      (v_detalhe->>'valor_unitario')::numeric,
      NULLIF(v_detalhe->>'data_servico', '')::date,
      v_detalhe->>'responsavel_servico',
      NULLIF(v_detalhe->>'horario_gravacao', '')::time,
      NULLIF(v_detalhe->>'horario_saida', '')::time,
      v_detalhe->>'servico',
      (v_detalhe->>'quantidade_diarias')::numeric
    );
  END LOOP;

  DELETE FROM public.os_responsaveis WHERE numero_os = v_numero;

  FOR v_responsavel IN SELECT * FROM jsonb_array_elements(coalesce(p_responsaveis, '[]'::jsonb))
  LOOP
    INSERT INTO public.os_responsaveis (
      numero_os, nome, valor_freelance, reembolso_conducao,
      reembolso_alimentacao, reembolso_hospedagem, agendamento,
      status_pagamento, data_pagamento
    ) VALUES (
      v_numero,
      v_responsavel->>'nome',
      NULLIF(v_responsavel->>'valor_freelance', '')::numeric,
      NULLIF(v_responsavel->>'reembolso_conducao', '')::numeric,
      NULLIF(v_responsavel->>'reembolso_alimentacao', '')::numeric,
      NULLIF(v_responsavel->>'reembolso_hospedagem', '')::numeric,
      NULLIF(v_responsavel->>'agendamento', '')::date,
      v_responsavel->>'status_pagamento',
      NULLIF(v_responsavel->>'data_pagamento', '')::date
    );
  END LOOP;

  v_depois := public.fn_snapshot_os(v_numero);

  IF v_antes IS NULL THEN
    v_acao := 'CRIACAO';
  ELSIF v_antes IS DISTINCT FROM v_depois THEN
    v_acao := 'EDICAO';
  END IF;

  IF v_acao IS NOT NULL THEN
    v_log_id := public.fn_registrar_log_ret('os', v_numero, v_acao, v_antes, v_depois);
  END IF;

  RETURN jsonb_build_object(
    'numero_os', v_numero,
    'acao', coalesce(v_acao, 'SEM_ALTERACAO'),
    'log_id', v_log_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.excluir_os(text);

CREATE OR REPLACE FUNCTION public.excluir_os(p_numero_os text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes jsonb;
  v_log_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode = '42501';
  END IF;

  v_antes := public.fn_snapshot_os(p_numero_os);
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'A OS % não foi encontrada.', p_numero_os USING errcode = 'P0002';
  END IF;

  DELETE FROM public.os_detalhes     WHERE numero_os = p_numero_os;
  DELETE FROM public.os_responsaveis WHERE numero_os = p_numero_os;
  DELETE FROM public.ordens_servico  WHERE numero_os = p_numero_os;

  v_log_id := public.fn_registrar_log_ret('os', p_numero_os, 'EXCLUSAO', v_antes, null);

  RETURN jsonb_build_object(
    'success', true,
    'numero_os', p_numero_os,
    'log_id', v_log_id
  );
END;
$$;

-- =====================================================================
-- 4. ATUALIZAR RPCs EM MASSA PARA REGISTRAR TODOS OS ITENS CONSOLIDADOS
-- =====================================================================

-- 4.1 NFS-e em Massa
CREATE OR REPLACE FUNCTION public.atualizar_nfs_e_em_massa(
  p_numeros_os text[],
  p_nfs_e text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num text;
  v_antes jsonb;
  v_depois jsonb;
  v_email text := auth.jwt() ->> 'email';
  v_count integer := 0;
  v_log_id bigint := null;
  v_itens_antes jsonb := '[]'::jsonb;
  v_itens_depois jsonb := '[]'::jsonb;
  v_reg_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode = '42501';
  END IF;

  IF p_numeros_os IS NULL OR array_length(p_numeros_os, 1) IS NULL OR array_length(p_numeros_os, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'count', 0, 'log_id', null);
  END IF;

  -- Caso unitário: mantém log padrão da OS
  IF array_length(p_numeros_os, 1) = 1 THEN
    v_num := p_numeros_os[1];
    v_antes := public.fn_snapshot_os(v_num);
    IF v_antes IS NOT NULL THEN
      UPDATE public.ordens_servico
         SET nfs_e = p_nfs_e,
             updated_at = now(),
             updated_by = auth.uid(),
             updated_by_email = v_email
       WHERE numero_os = v_num;

      v_depois := public.fn_snapshot_os(v_num);
      IF v_antes IS DISTINCT FROM v_depois THEN
        v_log_id := public.fn_registrar_log_ret('os', v_num, 'EDICAO', v_antes, v_depois);
        v_count := 1;
      END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'count', v_count, 'log_id', v_log_id);
  END IF;

  -- Caso em massa: captura todos os itens antes e depois em um único log consolidado
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'numero_os', o.numero_os,
             'nome_os', coalesce(o.nome_os, o.endereco, ''),
             'nfs_e', o.nfs_e
           ) ORDER BY o.numero_os
         ), '[]'::jsonb),
         count(*)
    INTO v_itens_antes, v_count
    FROM public.ordens_servico o
   WHERE o.numero_os = ANY(p_numeros_os);

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'count', 0, 'log_id', null);
  END IF;

  UPDATE public.ordens_servico
     SET nfs_e = p_nfs_e,
         updated_at = now(),
         updated_by = auth.uid(),
         updated_by_email = v_email
   WHERE numero_os = ANY(p_numeros_os);

  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'numero_os', o.numero_os,
             'nome_os', coalesce(o.nome_os, o.endereco, ''),
             'nfs_e', o.nfs_e
           ) ORDER BY o.numero_os
         ), '[]'::jsonb)
    INTO v_itens_depois
    FROM public.ordens_servico o
   WHERE o.numero_os = ANY(p_numeros_os);

  IF v_itens_antes IS DISTINCT FROM v_itens_depois THEN
    v_reg_id := v_count || ' OS(s) → NFS-e ' || coalesce(nullif(trim(p_nfs_e), ''), '(vazio)');
    v_log_id := public.fn_registrar_log_ret(
      'os',
      v_reg_id,
      'EDICAO',
      jsonb_build_object('tipo', 'bulk_nfse', 'nfs_e_nova', p_nfs_e, 'total_itens', v_count, 'itens', v_itens_antes),
      jsonb_build_object('tipo', 'bulk_nfse', 'nfs_e_nova', p_nfs_e, 'total_itens', v_count, 'itens', v_itens_depois)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'count', v_count, 'log_id', v_log_id);
END;
$$;

-- 4.2 Status de Pagamento de Responsáveis em Massa (registra TODOS os pagamentos selecionados em 1 log completo)
CREATE OR REPLACE FUNCTION public.atualizar_status_responsaveis_em_massa(
  p_ids bigint[],
  p_status text,
  p_data_pagamento date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email        text := auth.jwt() ->> 'email';
  v_os_list      text[];
  v_count_os     integer := 0;
  v_count_itens  integer := 0;
  v_valor_total  numeric := 0;
  v_nova_data    date;
  v_itens_antes  jsonb := '[]'::jsonb;
  v_itens_depois jsonb := '[]'::jsonb;
  v_log_id       bigint := null;
  v_reg_id       text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode = '42501';
  END IF;

  IF p_status NOT IN ('Pago', 'Pendente', 'Não se aplica') THEN
    RAISE EXCEPTION 'Status de pagamento inválido: %.', p_status USING errcode = '22023';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL OR array_length(p_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'count_os', 0, 'count_responsaveis', 0, 'log_id', null);
  END IF;

  -- 1. Capturar snapshot ANTERIOR de TODOS os pagamentos selecionados
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'numero_os', r.numero_os,
        'nome_os', coalesce(o.nome_os, o.endereco, ''),
        'nome', r.nome,
        'valor_freelance', coalesce(r.valor_freelance, 0),
        'reembolso_conducao', coalesce(r.reembolso_conducao, 0),
        'reembolso_alimentacao', coalesce(r.reembolso_alimentacao, 0),
        'reembolso_hospedagem', coalesce(r.reembolso_hospedagem, 0),
        'valor_total', coalesce(r.valor_freelance, 0) + coalesce(r.reembolso_conducao, 0) + coalesce(r.reembolso_alimentacao, 0) + coalesce(r.reembolso_hospedagem, 0),
        'agendamento', r.agendamento,
        'status_pagamento', coalesce(nullif(r.status_pagamento, ''), 'Pendente'),
        'data_pagamento', r.data_pagamento
      )
      ORDER BY r.nome, r.numero_os, r.id
    ), '[]'::jsonb),
    array_agg(DISTINCT r.numero_os),
    count(*),
    coalesce(sum(coalesce(r.valor_freelance, 0) + coalesce(r.reembolso_conducao, 0) + coalesce(r.reembolso_alimentacao, 0) + coalesce(r.reembolso_hospedagem, 0)), 0)
  INTO v_itens_antes, v_os_list, v_count_itens, v_valor_total
  FROM public.os_responsaveis r
  LEFT JOIN public.ordens_servico o ON o.numero_os = r.numero_os
  WHERE r.id = ANY(p_ids);

  IF v_count_itens = 0 THEN
    RETURN jsonb_build_object('success', true, 'count_os', 0, 'count_responsaveis', 0, 'log_id', null);
  END IF;

  v_count_os := coalesce(array_length(v_os_list, 1), 0);
  v_nova_data := CASE WHEN p_status = 'Pago' THEN coalesce(p_data_pagamento, current_date) ELSE NULL END;

  -- 2. Atualizar todos os pagamentos selecionados
  UPDATE public.os_responsaveis
     SET status_pagamento = p_status,
         data_pagamento = v_nova_data
   WHERE id = ANY(p_ids);

  -- 3. Atualizar carimbo de modificação nas OSs afetadas
  IF v_os_list IS NOT NULL AND v_count_os > 0 THEN
    UPDATE public.ordens_servico
       SET updated_at = now(),
           updated_by = auth.uid(),
           updated_by_email = v_email
     WHERE numero_os = ANY(v_os_list);
  END IF;

  -- 4. Capturar snapshot POSTERIOR de TODOS os pagamentos selecionados
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'id', r.id,
             'numero_os', r.numero_os,
             'nome_os', coalesce(o.nome_os, o.endereco, ''),
             'nome', r.nome,
             'valor_freelance', coalesce(r.valor_freelance, 0),
             'reembolso_conducao', coalesce(r.reembolso_conducao, 0),
             'reembolso_alimentacao', coalesce(r.reembolso_alimentacao, 0),
             'reembolso_hospedagem', coalesce(r.reembolso_hospedagem, 0),
             'valor_total', coalesce(r.valor_freelance, 0) + coalesce(r.reembolso_conducao, 0) + coalesce(r.reembolso_alimentacao, 0) + coalesce(r.reembolso_hospedagem, 0),
             'agendamento', r.agendamento,
             'status_pagamento', coalesce(nullif(r.status_pagamento, ''), 'Pendente'),
             'data_pagamento', r.data_pagamento
           )
           ORDER BY r.nome, r.numero_os, r.id
         ), '[]'::jsonb)
    INTO v_itens_depois
    FROM public.os_responsaveis r
    LEFT JOIN public.ordens_servico o ON o.numero_os = r.numero_os
   WHERE r.id = ANY(p_ids);

  -- 5. Registrar log consolidado contendo TODOS os pagamentos selecionados
  v_reg_id := v_count_itens || ' pagto(s) → ' || p_status;

  v_log_id := public.fn_registrar_log_ret(
    'pagamento',
    v_reg_id,
    'EDICAO',
    jsonb_build_object(
      'tipo', 'bulk_pagamento',
      'status_novo', p_status,
      'data_pagamento_nova', v_nova_data,
      'total_itens', v_count_itens,
      'total_os', v_count_os,
      'valor_total', v_valor_total,
      'itens', v_itens_antes
    ),
    jsonb_build_object(
      'tipo', 'bulk_pagamento',
      'status_novo', p_status,
      'data_pagamento_nova', v_nova_data,
      'total_itens', v_count_itens,
      'total_os', v_count_os,
      'valor_total', v_valor_total,
      'itens', v_itens_depois
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'count_os', v_count_os,
    'count_responsaveis', v_count_itens,
    'valor_total', v_valor_total,
    'status', p_status,
    'data_pagamento', v_nova_data
  );
END;
$$;

-- =====================================================================
-- 5. RPC DESFAZER AÇÃO A PARTIR DE QUALQUER LOG DE AUDITORIA REVERSÍVEL
-- =====================================================================
CREATE OR REPLACE FUNCTION public.desfazer_log_auditoria(p_log_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email          text := auth.jwt() ->> 'email';
  v_log            public.audit_logs%ROWTYPE;
  v_ant            jsonb;
  v_nov            jsonb;
  v_item           jsonb;
  v_item_id        bigint;
  v_item_os        text;
  v_item_nome      text;
  v_old_status     text;
  v_old_data       date;
  v_rows           integer;
  v_restored_count integer := 0;
  v_os_list        text[] := ARRAY[]::text[];
  v_numero         text;
  v_atual          jsonb;
  v_restaurado     jsonb;
  v_detalhe        jsonb;
  v_responsavel    jsonb;
  v_undo_log_id    bigint;
  v_undo_reg_id    text;
  v_itens_atual    jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode = '42501';
  END IF;

  SELECT * INTO v_log
    FROM public.audit_logs
   WHERE id = p_log_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de auditoria #% não encontrado.', p_log_id USING errcode = 'P0002';
  END IF;

  IF v_log.desfeito THEN
    RAISE EXCEPTION 'A ação #% já foi desfeita anteriormente.', p_log_id USING errcode = '22023';
  END IF;

  IF v_log.acao = 'DESFAZER' THEN
    RAISE EXCEPTION 'Não é possível desfazer um registro de reversão.' USING errcode = '22023';
  END IF;

  v_ant := v_log.dados_antigos;
  v_nov := v_log.dados_novos;

  -- -------------------------------------------------------------------
  -- CASO 1: PAGAMENTO EM MASSA (entidade = 'pagamento')
  -- -------------------------------------------------------------------
  IF v_log.entidade = 'pagamento' AND (v_ant ->> 'tipo') = 'bulk_pagamento' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_ant -> 'itens', '[]'::jsonb))
    LOOP
      v_item_id    := nullif(v_item ->> 'id', '')::bigint;
      v_item_os    := v_item ->> 'numero_os';
      v_item_nome  := v_item ->> 'nome';
      v_old_status := coalesce(nullif(v_item ->> 'status_pagamento', ''), 'Pendente');
      v_old_data   := nullif(v_item ->> 'data_pagamento', '')::date;

      -- Capturar estado atual do registro antes de reverter
      SELECT coalesce(
               (SELECT jsonb_build_object(
                  'id', r.id,
                  'numero_os', r.numero_os,
                  'nome_os', coalesce(v_item ->> 'nome_os', ''),
                  'nome', r.nome,
                  'valor_total', coalesce(r.valor_freelance, 0) + coalesce(r.reembolso_conducao, 0) + coalesce(r.reembolso_alimentacao, 0) + coalesce(r.reembolso_hospedagem, 0),
                  'status_pagamento', coalesce(nullif(r.status_pagamento, ''), 'Pendente'),
                  'data_pagamento', r.data_pagamento
                )
                FROM public.os_responsaveis r
                WHERE r.id = v_item_id),
               '{}'::jsonb
             )
        INTO v_atual;

      v_rows := 0;
      IF v_item_id IS NOT NULL THEN
        UPDATE public.os_responsaveis
           SET status_pagamento = v_old_status,
               data_pagamento   = v_old_data
         WHERE id = v_item_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      END IF;

      -- Fallback caso a OS tenha sido editada e os IDs de os_responsaveis recriados
      IF v_rows = 0 AND v_item_os IS NOT NULL AND v_item_nome IS NOT NULL THEN
        UPDATE public.os_responsaveis
           SET status_pagamento = v_old_status,
               data_pagamento   = v_old_data
         WHERE numero_os = v_item_os
           AND nome = v_item_nome;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
      END IF;

      IF v_rows > 0 THEN
        v_restored_count := v_restored_count + 1;
        IF v_item_os IS NOT NULL AND NOT (v_item_os = ANY(v_os_list)) THEN
          v_os_list := array_append(v_os_list, v_item_os);
        END IF;
        IF v_atual <> '{}'::jsonb THEN
          v_itens_atual := v_itens_atual || jsonb_build_array(v_atual);
        END IF;
      END IF;
    END LOOP;

    IF v_restored_count = 0 THEN
      RAISE EXCEPTION 'Nenhum pagamento correspondente foi encontrado para desfazer (as OSs podem ter sido excluídas).' USING errcode = 'P0002';
    END IF;

    IF array_length(v_os_list, 1) > 0 THEN
      UPDATE public.ordens_servico
         SET updated_at = now(),
             updated_by = auth.uid(),
             updated_by_email = v_email
       WHERE numero_os = ANY(v_os_list);
    END IF;

    v_undo_reg_id := 'Desfeito #' || p_log_id || ' (' || v_restored_count || ' pagto(s))';
    v_undo_log_id := public.fn_registrar_log_ret(
      'pagamento',
      v_undo_reg_id,
      'DESFAZER',
      jsonb_build_object(
        'tipo', 'bulk_pagamento',
        'log_desfeito_id', p_log_id,
        'total_itens', v_restored_count,
        'itens', CASE WHEN jsonb_array_length(v_itens_atual) > 0 THEN v_itens_atual ELSE v_nov -> 'itens' END
      ),
      jsonb_build_object(
        'tipo', 'bulk_pagamento',
        'log_desfeito_id', p_log_id,
        'total_itens', v_restored_count,
        'valor_total', coalesce((v_ant -> 'valor_total'), '0'::jsonb),
        'itens', v_ant -> 'itens'
      )
    );

  -- -------------------------------------------------------------------
  -- CASO 2: NFS-e EM MASSA (entidade = 'os' e tipo = 'bulk_nfse')
  -- -------------------------------------------------------------------
  ELSIF v_log.entidade = 'os' AND (v_ant ->> 'tipo') = 'bulk_nfse' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_ant -> 'itens', '[]'::jsonb))
    LOOP
      v_item_os := v_item ->> 'numero_os';
      UPDATE public.ordens_servico
         SET nfs_e = v_item ->> 'nfs_e',
             updated_at = now(),
             updated_by = auth.uid(),
             updated_by_email = v_email
       WHERE numero_os = v_item_os;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows > 0 THEN
        v_restored_count := v_restored_count + 1;
      END IF;
    END LOOP;

    IF v_restored_count = 0 THEN
      RAISE EXCEPTION 'Nenhuma OS correspondente foi encontrada para restaurar a NFS-e.' USING errcode = 'P0002';
    END IF;

    v_undo_reg_id := 'Desfeito #' || p_log_id || ' (' || v_restored_count || ' OS(s))';
    v_undo_log_id := public.fn_registrar_log_ret(
      'os',
      v_undo_reg_id,
      'DESFAZER',
      coalesce(v_nov, '{}'::jsonb) || jsonb_build_object('log_desfeito_id', p_log_id),
      coalesce(v_ant, '{}'::jsonb) || jsonb_build_object('log_desfeito_id', p_log_id)
    );

  -- -------------------------------------------------------------------
  -- CASO 3: ORDEM DE SERVIÇO INDIVIDUAL (entidade = 'os')
  -- -------------------------------------------------------------------
  ELSIF v_log.entidade = 'os' THEN
    v_numero := v_log.registro_id;

    IF v_log.acao = 'CRIACAO' THEN
      v_atual := public.fn_snapshot_os(v_numero);
      IF v_atual IS NULL THEN
        RAISE EXCEPTION 'A OS % não existe mais no banco para ser removida.', v_numero USING errcode = 'P0002';
      END IF;

      DELETE FROM public.os_detalhes     WHERE numero_os = v_numero;
      DELETE FROM public.os_responsaveis WHERE numero_os = v_numero;
      DELETE FROM public.ordens_servico  WHERE numero_os = v_numero;

      v_undo_log_id := public.fn_registrar_log_ret(
        'os',
        v_numero,
        'DESFAZER',
        v_atual,
        jsonb_build_object('log_desfeito_id', p_log_id, 'acao_desfeita', 'CRIACAO')
      );

    ELSIF v_log.acao = 'EDICAO' THEN
      IF v_ant IS NULL THEN
        RAISE EXCEPTION 'Snapshot anterior indisponível para desfazer esta edição.' USING errcode = '22023';
      END IF;

      v_atual := public.fn_snapshot_os(v_numero);
      IF v_atual IS NULL THEN
        RAISE EXCEPTION 'A OS % não foi encontrada no banco (pode ter sido excluída).', v_numero USING errcode = 'P0002';
      END IF;

      UPDATE public.ordens_servico SET
        nome_os              = coalesce(nullif(v_ant ->> 'nome_os', ''), v_ant ->> 'endereco'),
        cidade               = v_ant ->> 'cidade',
        endereco             = coalesce(nullif(v_ant ->> 'endereco', ''), v_ant ->> 'nome_os'),
        lote                 = nullif(v_ant ->> 'lote', ''),
        adicionais           = v_ant ->> 'adicionais',
        observacoes          = v_ant ->> 'observacoes',
        valor_unitario_total = nullif(v_ant ->> 'valor_unitario_total', '')::numeric,
        curso_responsavel    = nullif(v_ant ->> 'curso_responsavel', '')::numeric,
        nfs_e                = v_ant ->> 'nfs_e',
        valor_iss            = nullif(v_ant ->> 'valor_iss', '')::numeric,
        lucro_previsto       = nullif(v_ant ->> 'lucro_previsto', '')::numeric,
        status_conta_azul    = coalesce(nullif(v_ant ->> 'status_conta_azul', ''), 'Pendente'),
        updated_at           = now(),
        updated_by           = auth.uid(),
        updated_by_email     = v_email
      WHERE numero_os = v_numero;

      DELETE FROM public.os_detalhes WHERE numero_os = v_numero;
      FOR v_detalhe IN SELECT * FROM jsonb_array_elements(coalesce(v_ant -> 'detalhes', '[]'::jsonb))
      LOOP
        INSERT INTO public.os_detalhes (
          numero_os, valor_unitario, data_servico, responsavel_servico,
          horario_gravacao, horario_saida, servico, quantidade_diarias
        ) VALUES (
          v_numero,
          nullif(v_detalhe ->> 'valor_unitario', '')::numeric,
          nullif(v_detalhe ->> 'data_servico', '')::date,
          v_detalhe ->> 'responsavel_servico',
          nullif(v_detalhe ->> 'horario_gravacao', '')::time,
          nullif(v_detalhe ->> 'horario_saida', '')::time,
          v_detalhe ->> 'servico',
          coalesce(nullif(v_detalhe ->> 'quantidade_diarias', ''), nullif(v_detalhe ->> 'meia_diaria', ''))::numeric
        );
      END LOOP;

      DELETE FROM public.os_responsaveis WHERE numero_os = v_numero;
      FOR v_responsavel IN SELECT * FROM jsonb_array_elements(coalesce(v_ant -> 'responsaveis', '[]'::jsonb))
      LOOP
        INSERT INTO public.os_responsaveis (
          numero_os, nome, valor_freelance, reembolso_conducao,
          reembolso_alimentacao, reembolso_hospedagem, agendamento,
          status_pagamento, data_pagamento
        ) VALUES (
          v_numero,
          v_responsavel ->> 'nome',
          nullif(v_responsavel ->> 'valor_freelance', '')::numeric,
          nullif(v_responsavel ->> 'reembolso_conducao', '')::numeric,
          nullif(v_responsavel ->> 'reembolso_alimentacao', '')::numeric,
          nullif(v_responsavel ->> 'reembolso_hospedagem', '')::numeric,
          nullif(v_responsavel ->> 'agendamento', '')::date,
          v_responsavel ->> 'status_pagamento',
          nullif(v_responsavel ->> 'data_pagamento', '')::date
        );
      END LOOP;

      v_restaurado := public.fn_snapshot_os(v_numero);
      v_undo_log_id := public.fn_registrar_log_ret(
        'os',
        v_numero,
        'DESFAZER',
        v_atual,
        v_restaurado || jsonb_build_object('log_desfeito_id', p_log_id, 'acao_desfeita', 'EDICAO')
      );

    ELSIF v_log.acao = 'EXCLUSAO' THEN
      IF v_ant IS NULL THEN
        RAISE EXCEPTION 'Snapshot da OS excluída indisponível para restauração.' USING errcode = '22023';
      END IF;

      IF exists (SELECT 1 FROM public.ordens_servico WHERE numero_os = v_numero) THEN
        RAISE EXCEPTION 'Já existe uma OS com o número % cadastrada.', v_numero USING errcode = '23505';
      END IF;

      INSERT INTO public.ordens_servico (
        numero_os, nome_os, cidade, endereco, lote, adicionais, observacoes,
        valor_unitario_total, curso_responsavel, nfs_e, valor_iss, lucro_previsto,
        status_conta_azul, created_by_email, updated_at, updated_by, updated_by_email
      ) VALUES (
        v_numero,
        coalesce(nullif(v_ant ->> 'nome_os', ''), v_ant ->> 'endereco'),
        v_ant ->> 'cidade',
        coalesce(nullif(v_ant ->> 'endereco', ''), v_ant ->> 'nome_os'),
        nullif(v_ant ->> 'lote', ''),
        v_ant ->> 'adicionais',
        v_ant ->> 'observacoes',
        nullif(v_ant ->> 'valor_unitario_total', '')::numeric,
        nullif(v_ant ->> 'curso_responsavel', '')::numeric,
        v_ant ->> 'nfs_e',
        nullif(v_ant ->> 'valor_iss', '')::numeric,
        nullif(v_ant ->> 'lucro_previsto', '')::numeric,
        coalesce(nullif(v_ant ->> 'status_conta_azul', ''), 'Pendente'),
        v_email,
        now(),
        auth.uid(),
        v_email
      );

      FOR v_detalhe IN SELECT * FROM jsonb_array_elements(coalesce(v_ant -> 'detalhes', '[]'::jsonb))
      LOOP
        INSERT INTO public.os_detalhes (
          numero_os, valor_unitario, data_servico, responsavel_servico,
          horario_gravacao, horario_saida, servico, quantidade_diarias
        ) VALUES (
          v_numero,
          nullif(v_detalhe ->> 'valor_unitario', '')::numeric,
          nullif(v_detalhe ->> 'data_servico', '')::date,
          v_detalhe ->> 'responsavel_servico',
          nullif(v_detalhe ->> 'horario_gravacao', '')::time,
          nullif(v_detalhe ->> 'horario_saida', '')::time,
          v_detalhe ->> 'servico',
          coalesce(nullif(v_detalhe ->> 'quantidade_diarias', ''), nullif(v_detalhe ->> 'meia_diaria', ''))::numeric
        );
      END LOOP;

      FOR v_responsavel IN SELECT * FROM jsonb_array_elements(coalesce(v_ant -> 'responsaveis', '[]'::jsonb))
      LOOP
        INSERT INTO public.os_responsaveis (
          numero_os, nome, valor_freelance, reembolso_conducao,
          reembolso_alimentacao, reembolso_hospedagem, agendamento,
          status_pagamento, data_pagamento
        ) VALUES (
          v_numero,
          v_responsavel ->> 'nome',
          nullif(v_responsavel ->> 'valor_freelance', '')::numeric,
          nullif(v_responsavel ->> 'reembolso_conducao', '')::numeric,
          nullif(v_responsavel ->> 'reembolso_alimentacao', '')::numeric,
          nullif(v_responsavel ->> 'reembolso_hospedagem', '')::numeric,
          nullif(v_responsavel ->> 'agendamento', '')::date,
          v_responsavel ->> 'status_pagamento',
          nullif(v_responsavel ->> 'data_pagamento', '')::date
        );
      END LOOP;

      v_restaurado := public.fn_snapshot_os(v_numero);
      v_undo_log_id := public.fn_registrar_log_ret(
        'os',
        v_numero,
        'DESFAZER',
        null,
        v_restaurado || jsonb_build_object('log_desfeito_id', p_log_id, 'acao_desfeita', 'EXCLUSAO')
      );
    END IF;

  -- -------------------------------------------------------------------
  -- CASO 4: LOTE (entidade = 'lote')
  -- -------------------------------------------------------------------
  ELSIF v_log.entidade = 'lote' THEN
    PERFORM set_config('app.skip_config_audit', '1', true);

    IF v_log.acao = 'CRIACAO' THEN
      DELETE FROM public.lotes WHERE codigo = v_log.registro_id;
    ELSIF v_log.acao = 'EDICAO' THEN
      UPDATE public.lotes
         SET nome     = coalesce(v_ant ->> 'nome', nome),
             ativo    = coalesce((v_ant ->> 'ativo')::boolean, ativo),
             ordem    = coalesce((v_ant ->> 'ordem')::integer, ordem),
             produtos = coalesce(v_ant -> 'produtos', produtos)
       WHERE codigo = v_log.registro_id;
    ELSIF v_log.acao = 'EXCLUSAO' THEN
      INSERT INTO public.lotes (codigo, nome, ativo, ordem, produtos)
      VALUES (
        coalesce(v_ant ->> 'codigo', v_log.registro_id),
        coalesce(v_ant ->> 'nome', v_log.registro_id),
        coalesce((v_ant ->> 'ativo')::boolean, true),
        coalesce((v_ant ->> 'ordem')::integer, 0),
        coalesce(v_ant -> 'produtos', '[]'::jsonb)
      )
      ON CONFLICT (codigo) DO UPDATE SET
        nome     = excluded.nome,
        ativo    = excluded.ativo,
        ordem    = excluded.ordem,
        produtos = excluded.produtos;
    END IF;

    v_undo_log_id := public.fn_registrar_log_ret(
      'lote',
      v_log.registro_id,
      'DESFAZER',
      v_nov,
      coalesce(v_ant, '{}'::jsonb) || jsonb_build_object('log_desfeito_id', p_log_id)
    );

  -- -------------------------------------------------------------------
  -- CASO 5: CONFIGURAÇÕES (entidade = 'config')
  -- -------------------------------------------------------------------
  ELSIF v_log.entidade = 'config' THEN
    PERFORM set_config('app.skip_config_audit', '1', true);

    IF v_log.acao = 'EDICAO' AND v_ant IS NOT NULL THEN
      UPDATE public.configuracoes
         SET valor     = v_ant -> 'valor',
             descricao = coalesce(v_ant ->> 'descricao', descricao)
       WHERE chave = v_log.registro_id;
    END IF;

    v_undo_log_id := public.fn_registrar_log_ret(
      'config',
      v_log.registro_id,
      'DESFAZER',
      v_nov,
      coalesce(v_ant, '{}'::jsonb) || jsonb_build_object('log_desfeito_id', p_log_id)
    );

  ELSE
    RAISE EXCEPTION 'Tipo de registro de auditoria não suportado para reversão.' USING errcode = '22023';
  END IF;

  -- Marca o log original como desfeito
  UPDATE public.audit_logs
     SET desfeito           = true,
         desfeito_em        = now(),
         desfeito_por_email = v_email,
         desfeito_log_id    = v_undo_log_id
   WHERE id = p_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', p_log_id,
    'undo_log_id', v_undo_log_id,
    'entidade', v_log.entidade,
    'registro_id', v_log.registro_id
  );
END;
$$;

-- =====================================================================
-- 6. PERMISSÕES
-- =====================================================================
REVOKE ALL ON FUNCTION public.fn_registrar_log_ret(text, text, text, jsonb, jsonb) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.salvar_os(jsonb, jsonb, jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.salvar_os(jsonb, jsonb, jsonb, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.excluir_os(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.excluir_os(text) TO authenticated;

REVOKE ALL ON FUNCTION public.atualizar_nfs_e_em_massa(text[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_nfs_e_em_massa(text[], text) TO authenticated;

REVOKE ALL ON FUNCTION public.atualizar_status_responsaveis_em_massa(bigint[], text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_status_responsaveis_em_massa(bigint[], text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.desfazer_log_auditoria(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_log_auditoria(bigint) TO authenticated;

GRANT SELECT ON public.audit_logs TO authenticated;

COMMIT;
