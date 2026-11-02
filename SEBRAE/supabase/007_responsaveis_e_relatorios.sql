-- =====================================================================
--  SEBRAE - Gestão de OS  |  Script de Relatórios Mensais e Dados Bancários
--  Arquivo: 007_responsaveis_e_relatorios.sql
-- ---------------------------------------------------------------------
--  Como usar: Supabase > SQL Editor > New query > Cole tudo e clique RUN.
--  O script é idempotente (pode ser executado mais de uma vez com segurança).
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. TABELA DE CADASTROS BANCÁRIOS DOS RESPONSÁVEIS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.responsaveis_cadastros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL UNIQUE,
  cpf_cnpj        text,
  banco           text,
  agencia         text,
  conta           text,
  tipo_conta      text NOT NULL DEFAULT 'Corrente',
  tipo_chave_pix  text NOT NULL DEFAULT 'Chave Aleatória',
  chave_pix       text,
  titular         text,
  telefone        text,
  email           text,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Índices para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_responsaveis_cadastros_nome 
  ON public.responsaveis_cadastros (nome);

-- Insere automaticamente os responsáveis únicos já existentes nas OSs (sem duplicar)
INSERT INTO public.responsaveis_cadastros (nome, titular, created_at, updated_at)
SELECT DISTINCT TRIM(r.nome), TRIM(r.nome), now(), now()
FROM public.os_responsaveis r
WHERE r.nome IS NOT NULL AND TRIM(r.nome) <> ''
ON CONFLICT (nome) DO NOTHING;

-- =====================================================================
-- 2. TABELA DE RELATÓRIOS E FECHAMENTOS MENSAIS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.relatorios_mensais (
  id                      text PRIMARY KEY,
  titulo                  text NOT NULL,
  mes                     integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano                     integer NOT NULL CHECK (ano >= 2020),
  mes_nome                text NOT NULL,
  periodo_inicio          date,
  periodo_fim             date,
  total_faturado          numeric(14,2) NOT NULL DEFAULT 0,
  total_custos            numeric(14,2) NOT NULL DEFAULT 0,
  lucro_total             numeric(14,2) NOT NULL DEFAULT 0,
  margem_media            numeric(6,2)  NOT NULL DEFAULT 0,
  total_os                integer       NOT NULL DEFAULT 0,
  conta_azul_pendentes    integer       NOT NULL DEFAULT 0,
  pagamentos_pendentes    integer       NOT NULL DEFAULT 0,
  total_pagamentos_equipe numeric(14,2) NOT NULL DEFAULT 0,
  total_pago_equipe       numeric(14,2) NOT NULL DEFAULT 0,
  total_pendente_equipe   numeric(14,2) NOT NULL DEFAULT 0,
  observacoes             text,
  fechado_por             text,
  dados_snapshot          jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz   NOT NULL DEFAULT now()
);

-- Índices para ordenação e busca por ano/mês
CREATE INDEX IF NOT EXISTS idx_relatorios_mensais_ano_mes 
  ON public.relatorios_mensais (ano DESC, mes DESC);

-- =====================================================================
-- 3. PERMISSÕES E POLICIES (RLS)
-- =====================================================================
-- Garante acesso aos usuários autenticados e à role anon se habilitada
ALTER TABLE public.responsaveis_cadastros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorios_mensais ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Policy para responsaveis_cadastros (Full access)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'responsaveis_cadastros' AND policyname = 'allow_all_authenticated_cadastros'
  ) THEN
    CREATE POLICY allow_all_authenticated_cadastros 
      ON public.responsaveis_cadastros FOR ALL 
      TO public 
      USING (true) 
      WITH CHECK (true);
  END IF;

  -- Policy para relatorios_mensais (Full access)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'relatorios_mensais' AND policyname = 'allow_all_authenticated_relatorios'
  ) THEN
    CREATE POLICY allow_all_authenticated_relatorios 
      ON public.relatorios_mensais FOR ALL 
      TO public 
      USING (true) 
      WITH CHECK (true);
  END IF;
END $$;

COMMIT;
