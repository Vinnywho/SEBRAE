-- =====================================================================
-- 006_audit_bulk_actions.sql: Auditoria para Ações em Massa (NFS-e e Responsáveis)
-- =====================================================================

-- 1. RPC para atualizar NFS-e em massa com registro na tabela audit_logs
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode = '42501';
  END IF;

  IF p_numeros_os IS NULL OR array_length(p_numeros_os, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'count', 0);
  END IF;

  FOREACH v_num IN ARRAY p_numeros_os
  LOOP
    -- 1. Snapshot antes
    v_antes := public.fn_snapshot_os(v_num);
    
    IF v_antes IS NOT NULL THEN
      -- 2. Atualizar ordens_servico
      UPDATE public.ordens_servico
         SET nfs_e = p_nfs_e,
             updated_at = now(),
             updated_by = auth.uid(),
             updated_by_email = v_email
       WHERE numero_os = v_num;

      -- 3. Snapshot depois
      v_depois := public.fn_snapshot_os(v_num);

      -- 4. Registrar auditoria se houver diferenca
      IF v_antes IS DISTINCT FROM v_depois THEN
        PERFORM public.fn_registrar_log('os', v_num, 'EDICAO', v_antes, v_depois);
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;

-- 2. RPC para atualizar status e data de pagamento de responsáveis em massa com auditoria
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
  v_num text;
  v_antes jsonb;
  v_depois jsonb;
  v_snapshots_antes jsonb := '{}'::jsonb;
  v_email text := auth.jwt() ->> 'email';
  v_os_list text[];
  v_count_os integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'count', 0);
  END IF;

  -- Encontrar todas as OSs distintas envolvidas nos responsáveis selecionados
  SELECT array_agg(DISTINCT numero_os)
    INTO v_os_list
    FROM public.os_responsaveis
   WHERE id = ANY(p_ids);

  IF v_os_list IS NULL OR array_length(v_os_list, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'count', 0);
  END IF;

  -- 1. Capturar snapshot ANTERIOR de cada OS afetada
  FOREACH v_num IN ARRAY v_os_list
  LOOP
    v_antes := public.fn_snapshot_os(v_num);
    IF v_antes IS NOT NULL THEN
      v_snapshots_antes := jsonb_set(v_snapshots_antes, array[v_num], v_antes);
    END IF;
  END LOOP;

  -- 2. Atualizar os responsáveis selecionados
  UPDATE public.os_responsaveis
     SET status_pagamento = p_status,
         data_pagamento = CASE WHEN p_status = 'Pago' THEN coalesce(p_data_pagamento, current_date) ELSE NULL END
   WHERE id = ANY(p_ids);

  -- 3. Atualizar carimbo de modificação na OS
  UPDATE public.ordens_servico
     SET updated_at = now(),
         updated_by = auth.uid(),
         updated_by_email = v_email
   WHERE numero_os = ANY(v_os_list);

  -- 4. Capturar snapshot POSTERIOR de cada OS e gravar log de auditoria
  FOREACH v_num IN ARRAY v_os_list
  LOOP
    v_antes := v_snapshots_antes -> v_num;
    v_depois := public.fn_snapshot_os(v_num);

    IF v_antes IS NOT NULL AND v_depois IS NOT NULL AND v_antes IS DISTINCT FROM v_depois THEN
      PERFORM public.fn_registrar_log('os', v_num, 'EDICAO', v_antes, v_depois);
      v_count_os := v_count_os + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'count_os', v_count_os,
    'count_responsaveis', array_length(p_ids, 1)
  );
END;
$$;

-- Permissões para usuários autenticados chamarem as RPCs
GRANT EXECUTE ON FUNCTION public.atualizar_nfs_e_em_massa(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_status_responsaveis_em_massa(bigint[], text, date) TO authenticated;
