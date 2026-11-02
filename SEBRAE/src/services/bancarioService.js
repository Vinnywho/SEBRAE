import { supabase } from '../supabase';

const STORAGE_KEY = 'sebrae_cadastros_bancarios';
const CONFIG_KEY = 'cadastros_responsaveis_bancarios';

export const BANCOS_COMUNS = [
  '001 - Banco do Brasil',
  '260 - Nu Pagamentos (Nubank)',
  '077 - Banco Inter',
  '341 - Itaú Unibanco',
  '237 - Banco Bradesco',
  '104 - Caixa Econômica Federal',
  '033 - Banco Santander',
  '336 - Banco C6',
  '290 - PagBank (PagSeguro)',
  '748 - Banco Sicredi',
  '756 - Bancoob (Sicoob)',
  '380 - PicPay',
  'Outro Banco'
];

/**
 * Busca todos os cadastros bancários de responsáveis.
 * Tenta primeiro a tabela dedicada `responsaveis_cadastros`.
 * Se não existir ou falhar, recorre à tabela `configuracoes` e ao localStorage.
 */
export const fetchCadastrosBancarios = async () => {
  let list = [];

  // 1. Tentar ler da tabela dedicada
  try {
    const { data, error } = await supabase
      .from('responsaveis_cadastros')
      .select('*')
      .order('nome');

    if (!error && Array.isArray(data)) {
      list = data;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (_e) {
        // ignora erro de quota de storage
      }
      return list;
    }
  } catch (_err) {
    // Tabela pode não existir ainda
  }

  // 2. Fallback: Tentar ler de `configuracoes`
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
        // ignora erro
      }
      return list;
    }
  } catch (_err) {
    // Falha silenciosa no fallback
  }

  // 3. Fallback: Ler do localStorage
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      list = JSON.parse(local);
    }
  } catch (_e) {
    // ignora erro
  }

  return list;
};

/**
 * Salva ou atualiza os dados bancários de um responsável.
 */
export const saveCadastroBancario = async (cadastro) => {
  if (!cadastro || !cadastro.nome || !cadastro.nome.trim()) {
    throw new Error('O nome do responsável é obrigatório.');
  }

  const payload = {
    nome: cadastro.nome.trim(),
    cpf_cnpj: (cadastro.cpf_cnpj || '').trim(),
    banco: (cadastro.banco || '').trim(),
    agencia: (cadastro.agencia || '').trim(),
    conta: (cadastro.conta || '').trim(),
    tipo_conta: cadastro.tipo_conta || 'Corrente',
    tipo_chave_pix: cadastro.tipo_chave_pix || 'Chave Aleatória',
    chave_pix: (cadastro.chave_pix || '').trim(),
    titular: (cadastro.titular || '').trim(),
    telefone: (cadastro.telefone || '').trim(),
    email: (cadastro.email || '').trim(),
    observacoes: (cadastro.observacoes || '').trim(),
    updated_at: new Date().toISOString()
  };

  // 1. Tentar salvar na tabela dedicada
  try {
    await supabase
      .from('responsaveis_cadastros')
      .upsert(payload, { onConflict: 'nome' });
  } catch (_err) {
    // Tabela pode não existir
  }

  // 2. Sempre atualizar também o backup na tabela `configuracoes` para redundância
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

    const idx = currentList.findIndex(
      (item) => item.nome?.toLowerCase() === payload.nome.toLowerCase()
    );
    if (idx >= 0) {
      currentList[idx] = { ...currentList[idx], ...payload };
    } else {
      currentList.push(payload);
    }

    await supabase.from('configuracoes').upsert({
      chave: CONFIG_KEY,
      valor: currentList,
      descricao: 'Cadastros de dados bancários e chaves PIX dos responsáveis',
      updated_at: new Date().toISOString()
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentList));
    } catch (_e) {
      // ignora
    }
  } catch (_err) {
    // Se der erro no supabase, salva pelo menos no localStorage
    try {
      const local = localStorage.getItem(STORAGE_KEY);
      let list = local ? JSON.parse(local) : [];
      const idx = list.findIndex(
        (item) => item.nome?.toLowerCase() === payload.nome.toLowerCase()
      );
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...payload };
      } else {
        list.push(payload);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_e) {
      // ignora
    }
  }

  return payload;
};

/**
 * Remove os dados bancários de um responsável.
 */
export const deleteCadastroBancario = async (nome) => {
  if (!nome) return;

  // 1. Tenta deletar da tabela
  try {
    await supabase.from('responsaveis_cadastros').delete().eq('nome', nome);
  } catch (_e) {
    // ignora
  }

  // 2. Remove do backup em `configuracoes`
  try {
    const { data } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', CONFIG_KEY)
      .maybeSingle();

    if (data && Array.isArray(data.valor)) {
      const updated = data.valor.filter(
        (item) => item.nome?.toLowerCase() !== nome.toLowerCase()
      );
      await supabase.from('configuracoes').upsert({
        chave: CONFIG_KEY,
        valor: updated,
        descricao: 'Cadastros de dados bancários e chaves PIX dos responsáveis',
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

  // 3. Remove do localStorage
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      const list = JSON.parse(local).filter(
        (item) => item.nome?.toLowerCase() !== nome.toLowerCase()
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (_e) {
    // ignora
  }
};

/**
 * Gera texto formatado para copiar para área de transferência e colar no app do banco.
 */
export const formatDadosParaCopia = (c) => {
  if (!c) return '';
  const lines = [];
  lines.push(`DADOS BANCÁRIOS - ${c.nome}`);
  if (c.titular && c.titular !== c.nome) lines.push(`Titular: ${c.titular}`);
  if (c.cpf_cnpj) lines.push(`CPF/CNPJ: ${c.cpf_cnpj}`);
  if (c.banco) lines.push(`Banco: ${c.banco}`);
  if (c.agencia) lines.push(`Agência: ${c.agencia}`);
  if (c.conta) lines.push(`Conta: ${c.conta} (${c.tipo_conta || 'Corrente'})`);
  if (c.chave_pix) lines.push(`PIX (${c.tipo_chave_pix || 'Chave'}): ${c.chave_pix}`);
  if (c.observacoes) lines.push(`Obs: ${c.observacoes}`);
  return lines.join('\n');
};
