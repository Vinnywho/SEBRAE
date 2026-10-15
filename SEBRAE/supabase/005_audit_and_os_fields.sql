-- =====================================================================
-- 005_audit_and_os_fields.sql: Novos campos da OS e Auditoria Completa
-- =====================================================================

-- 1. Garantir tabela audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  user_id      uuid references auth.users(id) on delete set null,
  user_email   text,
  entidade     text not null check (entidade in ('os', 'lote', 'config')),
  registro_id  text not null,
  acao         text not null check (acao in ('CRIACAO', 'EDICAO', 'EXCLUSAO')),
  dados_antigos jsonb,
  dados_novos   jsonb
);

-- Garantir colunas em ordens_servico
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS nome_os text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by_email text,
  ADD COLUMN IF NOT EXISTS created_by_email text;

-- Copiar dados antigos de endereco para nome_os onde estiver vazio
UPDATE public.ordens_servico 
   SET nome_os = endereco 
 WHERE nome_os IS NULL AND endereco IS NOT NULL;

-- Função auxiliar para registrar logs com segurança
CREATE OR REPLACE FUNCTION public.fn_registrar_log(
  p_entidade text, p_registro_id text, p_acao text, p_antigo jsonb, p_novo jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (entidade, registro_id, acao, dados_antigos, dados_novos, user_id, user_email)
  VALUES (p_entidade, p_registro_id, p_acao, p_antigo, p_novo, auth.uid(), auth.jwt() ->> 'email');
END;
$$;

-- 2. Garantir que a funcao fn_snapshot_os inclua nome_os e cidade
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
                       ORDER BY d.data_servico NULLS LAST, d.horario_gravacao NULLS LAST, d.responsavel_servico)
        FROM public.os_detalhes d
       WHERE d.numero_os = p_numero_os), '[]'::jsonb),
    'responsaveis', coalesce((
      SELECT jsonb_agg(to_jsonb(r) - array['id', 'created_at', 'numero_os'] ORDER BY r.nome)
        FROM public.os_responsaveis r
       WHERE r.numero_os = p_numero_os), '[]'::jsonb)
  );
END;
$$;

-- 3. Atualizar a RPC salvar_os para gravar nome_os, cidade e gerar os logs de auditoria
DROP FUNCTION IF EXISTS public.salvar_os(jsonb, jsonb, jsonb, boolean);

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

  -- Foto antes da modificacao
  v_antes := public.fn_snapshot_os(v_numero);

  -- 1. Cabeçalho da OS
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

  -- 2. Detalhes
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

  -- 3. Responsáveis
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

  -- 4. Gravação da Auditoria
  v_depois := public.fn_snapshot_os(v_numero);

  IF v_antes IS NULL THEN
    v_acao := 'CRIACAO';
  ELSIF v_antes IS DISTINCT FROM v_depois THEN
    v_acao := 'EDICAO';
  END IF;

  IF v_acao IS NOT NULL THEN
    PERFORM public.fn_registrar_log('os', v_numero, v_acao, v_antes, v_depois);
  END IF;

  RETURN jsonb_build_object('numero_os', v_numero, 'acao', coalesce(v_acao, 'SEM_ALTERACAO'));
END;
$$;

-- 4. Função RPC excluir_os com auditoria
CREATE OR REPLACE FUNCTION public.excluir_os(p_numero_os text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes jsonb;
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

  PERFORM public.fn_registrar_log('os', p_numero_os, 'EXCLUSAO', v_antes, null);
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.salvar_os(jsonb, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_os(text) TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
