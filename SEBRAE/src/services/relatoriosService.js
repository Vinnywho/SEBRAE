import { supabase } from '../supabase';
import { parseMonetary } from '../utils/format';

const STORAGE_KEY = 'sebrae_relatorios_mensais';
const CONFIG_KEY = 'relatorios_mensais';
const ACTIVE_PERIOD_KEY = 'sebrae_active_dashboard_period';

export const MESES_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Retorna o período ativo configurado para os cards do dashboard.
 * Padrão: mês atual.
 */
export const getActiveDashboardPeriod = () => {
  try {
    const saved = localStorage.getItem(ACTIVE_PERIOD_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.ano !== undefined) {
        return parsed;
      }
    }
  } catch (_e) {
    // ignora
  }

  const now = new Date();
  return {
    tipo: 'mes_atual',
    ano: now.getFullYear(),
    mes: now.getMonth() + 1, // 1-12
    label: `${MESES_NOMES[now.getMonth()]} de ${now.getFullYear()}`
  };
};

/**
 * Define o período ativo dos cards do dashboard.
 */
export const setActiveDashboardPeriod = (period) => {
  try {
    localStorage.setItem(ACTIVE_PERIOD_KEY, JSON.stringify(period));
  } catch (_e) {
    // ignora
  }
};

/**
 * Busca todos os relatórios mensais já fechados.
 */
export const fetchRelatoriosMensais = async () => {
  let list = [];

  // 1. Tentar tabela dedicada
  try {
    const { data, error } = await supabase
      .from('relatorios_mensais')
      .select('*')
      .order('ano', { ascending: false })
      .order('mes', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      list = data;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (_e) {
        // ignora
      }
      return list;
    }
  } catch (_err) {
    // Tabela pode não existir
  }

  // 2. Fallback: tabela `configuracoes`
  try {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', CONFIG_KEY)
      .maybeSingle();

    if (!error && data && Array.isArray(data.valor)) {
      list = data.valor;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (_e) {
        // ignora
      }
      return list;
    }
  } catch (_err) {
    // ignora
  }

  // 3. Fallback: localStorage
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      list = JSON.parse(local);
    }
  } catch (_e) {
    // ignora
  }

  return list;
};

/**
 * Salva um novo relatório mensal no histórico.
 */
export const salvarRelatorioMensal = async (relatorio) => {
  const payload = {
    id: relatorio.id || `rel_${relatorio.ano}_${String(relatorio.mes).padStart(2, '0')}_${Date.now()}`,
    titulo: relatorio.titulo || `Fechamento ${MESES_NOMES[relatorio.mes - 1]} / ${relatorio.ano}`,
    mes: Number(relatorio.mes),
    ano: Number(relatorio.ano),
    mes_nome: MESES_NOMES[relatorio.mes - 1] || '',
    periodo_inicio: relatorio.periodo_inicio,
    periodo_fim: relatorio.periodo_fim,
    total_faturado: parseMonetary(relatorio.total_faturado),
    total_custos: parseMonetary(relatorio.total_custos),
    lucro_total: parseMonetary(relatorio.lucro_total),
    margem_media: Number(relatorio.margem_media) || 0,
    total_os: Number(relatorio.total_os) || 0,
    conta_azul_pendentes: Number(relatorio.conta_azul_pendentes) || 0,
    pagamentos_pendentes: Number(relatorio.pagamentos_pendentes) || 0,
    total_pagamentos_equipe: parseMonetary(relatorio.total_pagamentos_equipe),
    total_pago_equipe: parseMonetary(relatorio.total_pago_equipe),
    total_pendente_equipe: parseMonetary(relatorio.total_pendente_equipe),
    observacoes: relatorio.observacoes || '',
    fechado_por: relatorio.fechado_por || '',
    dados_snapshot: relatorio.dados_snapshot || {},
    created_at: new Date().toISOString()
  };

  // 1. Tentar tabela dedicada
  try {
    await supabase.from('relatorios_mensais').upsert(payload);
  } catch (_e) {
    // Tabela pode não existir
  }

  // 2. Salvar em `configuracoes`
  try {
    let currentList = [];
    const { data } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', CONFIG_KEY)
      .maybeSingle();

    if (data && Array.isArray(data.valor)) {
      currentList = data.valor;
    } else {
      const local = localStorage.getItem(STORAGE_KEY);
      if (local) currentList = JSON.parse(local);
    }

    currentList = currentList.filter(item => item.id !== payload.id);
    currentList.unshift(payload);

    await supabase.from('configuracoes').upsert({
      chave: CONFIG_KEY,
      valor: currentList,
      descricao: 'Histórico de relatórios de fechamentos mensais com resultados',
      updated_at: new Date().toISOString()
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentList));
    } catch (_e) {
      // ignora
    }
  } catch (_err) {
    try {
      const local = localStorage.getItem(STORAGE_KEY);
      let list = local ? JSON.parse(local) : [];
      list = list.filter(item => item.id !== payload.id);
      list.unshift(payload);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_e) {
      // ignora
    }
  }

  return payload;
};

/**
 * Exclui um relatório do histórico.
 */
export const deleteRelatorioMensal = async (id) => {
  if (!id) return;

  try {
    await supabase.from('relatorios_mensais').delete().eq('id', id);
  } catch (_e) {
    // ignora
  }

  try {
    const { data } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', CONFIG_KEY)
      .maybeSingle();

    if (data && Array.isArray(data.valor)) {
      const updated = data.valor.filter(item => item.id !== id);
      await supabase.from('configuracoes').upsert({
        chave: CONFIG_KEY,
        valor: updated,
        updated_at: new Date().toISOString()
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (_e) {
        // ignora
      }
    }
  } catch (_e) {
    // ignora
  }

  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      const list = JSON.parse(local).filter(item => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (_e) {
    // ignora
  }
};

/**
 * Calcula os resultados e totais financeiros para uma lista de OSs filtradas por período.
 */
export const calcularResultadosPeriodo = (ordens, ano, mes) => {
  let faturado = 0;
  let custos = 0;
  let lucro = 0;
  let contaAzulPend = 0;
  let pagPendentes = 0;
  let totalEquipe = 0;
  let totalEquipePago = 0;
  let totalEquipePendente = 0;

  const osFiltradas = ordens.filter(os => {
    if (!ano || !mes) return true;
    const d = new Date(os.created_at);
    return d.getFullYear() === Number(ano) && (d.getMonth() + 1) === Number(mes);
  });

  const listaResponsaveis = [];

  osFiltradas.forEach(os => {
    const vTotal = parseMonetary(os.valor_unitario_total);
    const vCusto = parseMonetary(os.curso_responsavel) + parseMonetary(os.valor_iss);
    const vLucro = parseMonetary(os.lucro_previsto);

    faturado += vTotal;
    custos += vCusto;
    lucro += vLucro;

    if (os.status_conta_azul !== 'Concluído') {
      contaAzulPend += 1;
    }

    if (os.os_responsaveis && os.os_responsaveis.length > 0) {
      os.os_responsaveis.forEach(r => {
        const freel = parseMonetary(r.valor_freelance);
        const cond = parseMonetary(r.reembolso_conducao);
        const alim = parseMonetary(r.reembolso_alimentacao);
        const hosp = parseMonetary(r.reembolso_hospedagem);
        const tot = freel + cond + alim + hosp;

        totalEquipe += tot;
        if (r.status_pagamento === 'Pago') {
          totalEquipePago += tot;
        } else if (r.status_pagamento !== 'Não se aplica') {
          totalEquipePendente += tot;
          pagPendentes += 1;
        }

        listaResponsaveis.push({
          ...r,
          total: tot,
          numero_os: os.numero_os,
          nome_os: os.nome_os || os.endereco,
          cidade: os.cidade
        });
      });
    }
  });

  const margem = faturado > 0 ? (lucro / faturado) * 100 : 0;

  return {
    total_faturado: faturado,
    total_custos: custos,
    lucro_total: lucro,
    margem_media: margem,
    total_os: osFiltradas.length,
    conta_azul_pendentes: contaAzulPend,
    pagamentos_pendentes: pagPendentes,
    total_pagamentos_equipe: totalEquipe,
    total_pago_equipe: totalEquipePago,
    total_pendente_equipe: totalEquipePendente,
    os_lista: osFiltradas,
    responsaveis_lista: listaResponsaveis
  };
};
