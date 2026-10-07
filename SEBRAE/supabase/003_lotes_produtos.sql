-- 1. Adicionar suporte a múltiplos produtos na tabela de lotes
ALTER TABLE public.lotes 
ADD COLUMN IF NOT EXISTS produtos jsonb DEFAULT '[]'::jsonb;

-- 2. (Opcional) Limpeza caso a coluna antiga ainda esteja lá
ALTER TABLE public.lotes 
DROP COLUMN IF EXISTS valor_diaria;
