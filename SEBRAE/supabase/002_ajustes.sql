-- 1. Converter a coluna "meia_diaria" (texto) para "quantidade_diarias" (numérico)
-- Primeiro, garante a conversão de textos legados
ALTER TABLE public.os_detalhes 
  ALTER COLUMN meia_diaria TYPE numeric 
  USING (
    CASE 
      WHEN meia_diaria = 'Meia diária' THEN 0.5 
      WHEN meia_diaria = 'Diária' THEN 1 
      ELSE COALESCE(NULLIF(meia_diaria, ''), '1')::numeric 
    END
  );

-- Agora renomeia a coluna
ALTER TABLE public.os_detalhes RENAME COLUMN meia_diaria TO quantidade_diarias;

-- 2. Remover a coluna "valor_hl" que não será mais utilizada
ALTER TABLE public.ordens_servico DROP COLUMN IF EXISTS valor_hl;

-- 3. Remover a coluna "valor_meia_diaria" dos lotes (já que agora é calculado multiplicando a quantidade)
ALTER TABLE public.lotes DROP COLUMN IF EXISTS valor_meia_diaria;

-- 4. Atualizar a função RPC "salvar_os" para refletir a nova estrutura
DROP FUNCTION IF EXISTS public.salvar_os(jsonb, jsonb, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.salvar_os(
  p_os jsonb,
  p_detalhes jsonb,
  p_responsaveis jsonb,
  p_is_novo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_os_numero text;
  v_detalhe jsonb;
  v_responsavel jsonb;
BEGIN
  v_os_numero := p_os->>'numero_os';

  -- Insere ou atualiza a OS (removido o valor_hl)
  IF p_is_novo THEN
    INSERT INTO public.ordens_servico (
      numero_os, lote, endereco, adicionais, observacoes, nfs_e, 
      status_conta_azul, valor_unitario_total, curso_responsavel, valor_iss, lucro_previsto
    ) VALUES (
      v_os_numero,
      p_os->>'lote',
      p_os->>'endereco',
      p_os->>'adicionais',
      p_os->>'observacoes',
      p_os->>'nfs_e',
      p_os->>'status_conta_azul',
      (p_os->>'valor_unitario_total')::numeric,
      (p_os->>'curso_responsavel')::numeric,
      (p_os->>'valor_iss')::numeric,
      (p_os->>'lucro_previsto')::numeric
    );
  ELSE
    UPDATE public.ordens_servico
    SET 
      lote = p_os->>'lote',
      endereco = p_os->>'endereco',
      adicionais = p_os->>'adicionais',
      observacoes = p_os->>'observacoes',
      nfs_e = p_os->>'nfs_e',
      status_conta_azul = p_os->>'status_conta_azul',
      valor_unitario_total = (p_os->>'valor_unitario_total')::numeric,
      curso_responsavel = (p_os->>'curso_responsavel')::numeric,
      valor_iss = (p_os->>'valor_iss')::numeric,
      lucro_previsto = (p_os->>'lucro_previsto')::numeric,
      updated_at = NOW(),
      updated_by = auth.uid(),
      updated_by_email = auth.jwt()->>'email'
    WHERE numero_os = v_os_numero;
  END IF;

  -- Processa detalhes
  DELETE FROM public.os_detalhes WHERE numero_os = v_os_numero;
  
  FOR v_detalhe IN SELECT * FROM jsonb_array_elements(p_detalhes)
  LOOP
    INSERT INTO public.os_detalhes (
      numero_os, valor_unitario, data_servico, responsavel_servico,
      horario_gravacao, horario_saida, servico, quantidade_diarias
    ) VALUES (
      v_os_numero,
      (v_detalhe->>'valor_unitario')::numeric,
      NULLIF(v_detalhe->>'data_servico', '')::date,
      v_detalhe->>'responsavel_servico',
      NULLIF(v_detalhe->>'horario_gravacao', '')::time,
      NULLIF(v_detalhe->>'horario_saida', '')::time,
      v_detalhe->>'servico',
      (v_detalhe->>'quantidade_diarias')::numeric
    );
  END LOOP;

  -- Processa responsáveis
  DELETE FROM public.os_responsaveis WHERE numero_os = v_os_numero;

  FOR v_responsavel IN SELECT * FROM jsonb_array_elements(p_responsaveis)
  LOOP
    INSERT INTO public.os_responsaveis (
      numero_os, nome, valor_freelance, reembolso_conducao,
      reembolso_alimentacao, reembolso_hospedagem, agendamento,
      status_pagamento, data_pagamento
    ) VALUES (
      v_os_numero,
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

END;
$$;
