import { supabase } from '../supabase';
import { formatBRL } from '../utils/format';

/**
 * Executa a reversão transacional de um log de auditoria no Supabase.
 * @param {number|string} logId
 */
export const undoAuditLog = async (logId) => {
  const { data, error } = await supabase.rpc('desfazer_log_auditoria', {
    p_log_id: logId
  });
  if (error) throw error;
  return data;
};

/**
 * Busca logs recentes de pagamentos em massa que ainda podem ser desfeitos.
 * Retorna lista vazia se a migration 009 ainda não tiver sido aplicada.
 * @param {number} limit
 */
export const fetchRecentUndoablePaymentLogs = async (limit = 10) => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entidade', 'pagamento')
    .eq('desfeito', false)
    .neq('acao', 'DESFAZER')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    // Fallback silencioso caso a coluna desfeito ou entidade pagamento ainda não exista
    console.warn('Histórico de pagamentos em massa indisponível:', error.message);
    return [];
  }

  return data || [];
};

/**
 * Verifica se um registro de log pode ser desfeito.
 */
export const isLogReversible = (log) => {
  if (!log || log.desfeito || log.acao === 'DESFAZER') return false;
  if (!['os', 'lote', 'config', 'pagamento'].includes(log.entidade)) return false;
  if (log.acao === 'EDICAO' && !log.dados_antigos) return false;
  if (log.acao === 'EXCLUSAO' && !log.dados_antigos) return false;
  return true;
};

/**
 * Gera resumo legível para qualquer log de auditoria.
 */
export const getAcaoResumo = (log) => {
  if (!log) return '';
  const ent = log.entidade;
  const acao = log.acao;
  const id = log.registro_id;
  const novos = log.dados_novos || {};
  const antigos = log.dados_antigos || {};

  if (acao === 'DESFAZER') {
    const logRef = novos.log_desfeito_id || antigos.log_desfeito_id;
    const refLabel = logRef ? ` (Log #${logRef})` : '';
    if (ent === 'pagamento') {
      const total = novos.total_itens || (novos.itens ? novos.itens.length : 0);
      return `Desfez alteração de ${total} pagamento(s) em massa${refLabel}`;
    }
    if (ent === 'os' && novos.tipo === 'bulk_nfse') {
      const total = novos.total_itens || (novos.itens ? novos.itens.length : 0);
      return `Desfez atribuição de NFS-e em ${total} OS(s)${refLabel}`;
    }
    if (ent === 'os') {
      return `Desfez ${novos.acao_desfeita ? novos.acao_desfeita.toLowerCase() : 'alteração'} da OS #${id}${refLabel}`;
    }
    return `Desfez alteração em ${ent} (${id})${refLabel}`;
  }

  if (ent === 'pagamento' && novos.tipo === 'bulk_pagamento') {
    const total = novos.total_itens || (novos.itens ? novos.itens.length : 0);
    const status = novos.status_novo || '';
    const valor = novos.valor_total !== undefined ? ` • ${formatBRL(novos.valor_total)}` : '';
    return `Atribuiu "${status}" para ${total} ${total === 1 ? 'pagamento' : 'pagamentos'}${valor}`;
  }

  if (ent === 'os' && novos.tipo === 'bulk_nfse') {
    const total = novos.total_itens || (novos.itens ? novos.itens.length : 0);
    const nfs = novos.nfs_e_nova || '(vazio)';
    return `Atribuiu NFS-e "${nfs}" em massa para ${total} OS(s)`;
  }

  if (ent === 'os') {
    if (acao === 'CRIACAO') return `Criou a Ordem de Serviço #${id}`;
    if (acao === 'EDICAO') return `Atualizou a Ordem de Serviço #${id}`;
    if (acao === 'EXCLUSAO') return `Excluiu a Ordem de Serviço #${id}`;
  }
  if (ent === 'lote') {
    if (acao === 'CRIACAO') return `Cadastrou um novo lote (${id})`;
    if (acao === 'EDICAO') return `Atualizou a tabela de preços do lote (${id})`;
    if (acao === 'EXCLUSAO') return `Removeu o lote (${id})`;
  }
  if (ent === 'config') {
    return `Atualizou parâmetros do sistema (${id})`;
  }
  return `${acao} em ${ent} (#${id})`;
};

/**
 * Gera mensagem de confirmação amigável antes de desfazer um log.
 */
export const getUndoConfirmMessage = (log) => {
  if (!log) return 'Deseja desfazer esta ação?';
  const novos = log.dados_novos || {};

  if (log.entidade === 'pagamento' && novos.tipo === 'bulk_pagamento') {
    const total = novos.total_itens || (novos.itens ? novos.itens.length : 0);
    return `Deseja desfazer a atribuição de "${novos.status_novo}" para ${total} ${total === 1 ? 'pagamento' : 'pagamentos'}? Cada responsável voltará exatamente ao status e data de pagamento anteriores.`;
  }

  if (log.entidade === 'os' && novos.tipo === 'bulk_nfse') {
    const total = novos.total_itens || (novos.itens ? novos.itens.length : 0);
    return `Deseja desfazer a atribuição em massa da NFS-e "${novos.nfs_e_nova || ''}" e restaurar a NFS-e anterior das ${total} OSs afetadas?`;
  }

  if (log.entidade === 'os') {
    if (log.acao === 'CRIACAO') {
      return `Deseja desfazer a criação da OS #${log.registro_id}? Isso irá excluir a OS criada.`;
    }
    if (log.acao === 'EDICAO') {
      return `Deseja desfazer esta edição na OS #${log.registro_id} e restaurar todos os dados, serviços e responsáveis para o estado anterior?`;
    }
    if (log.acao === 'EXCLUSAO') {
      return `Deseja desfazer a exclusão da OS #${log.registro_id} e restaurar a OS completa com todos os serviços e responsáveis?`;
    }
  }

  return `Deseja desfazer a ação "${getAcaoResumo(log)}" e restaurar o estado anterior?`;
};
