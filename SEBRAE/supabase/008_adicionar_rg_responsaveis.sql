-- =====================================================================
--  SEBRAE - Gestão de OS  |  Adicionar RG e E-mail para Equipe
--  Arquivo: 008_adicionar_rg_responsaveis.sql
-- ---------------------------------------------------------------------
--  Como usar: Supabase > SQL Editor > New query > Cole tudo e clique RUN.
--  O script é idempotente (pode ser executado mais de uma vez com segurança).
-- =====================================================================

BEGIN;

-- 1. Garante a coluna rg na tabela de cadastros da equipe/responsáveis
ALTER TABLE public.responsaveis_cadastros 
ADD COLUMN IF NOT EXISTS rg text;

-- 2. Garante a coluna email na tabela de cadastros da equipe/responsáveis
ALTER TABLE public.responsaveis_cadastros 
ADD COLUMN IF NOT EXISTS email text;

-- 3. Atualiza índices se necessário
CREATE INDEX IF NOT EXISTS idx_responsaveis_cadastros_cpf_cnpj 
  ON public.responsaveis_cadastros (cpf_cnpj);

CREATE INDEX IF NOT EXISTS idx_responsaveis_cadastros_email 
  ON public.responsaveis_cadastros (email);

COMMIT;
