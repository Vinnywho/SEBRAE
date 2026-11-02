import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '../../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { 
  Search, User, FileText, CheckCircle, Clock, MinusCircle, 
  Users, ChevronDown, ChevronRight, Calendar, ArrowRight,
  CheckSquare, ArrowUpDown, ArrowUp, ArrowDown, Landmark,
  CreditCard, Copy, Edit3, X, Save, AlertCircle, ExternalLink,
  DollarSign
} from 'lucide-react';
import { formatBRL, parseMonetary } from '../../utils/format';
import { 
  fetchCadastrosBancarios, 
  saveCadastroBancario, 
  formatDadosParaCopia 
} from '../../services/bancarioService';
import './ListaResponsaveis.css';

const BANCOS_COMUNS = [
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

const ListaResponsaveis = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [responsaveis, setResponsaveis] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [dataAgendamentoInicio, setDataAgendamentoInicio] = useState('');
  const [dataAgendamentoFim, setDataAgendamentoFim] = useState('');
  const [agruparPorPessoa, setAgruparPorPessoa] = useState(false);
  const [expandedPessoas, setExpandedPessoas] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Cadastros Bancários
  const [cadastrosBancarios, setCadastrosBancarios] = useState([]);
  const [showBankModal, setShowBankModal] = useState(false);
  const [activeBankPerson, setActiveBankPerson] = useState('');
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [bankFormData, setBankFormData] = useState({
    nome: '',
    cpf_cnpj: '',
    banco: '',
    agencia: '',
    conta: '',
    tipo_conta: 'Corrente',
    tipo_chave_pix: 'Chave Aleatória',
    chave_pix: '',
    titular: '',
    telefone: '',
    email: '',
    observacoes: ''
  });

  // Bulk Actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('Pago');
  const [bulkDataPagamento, setBulkDataPagamento] = useState(new Date().toISOString().split('T')[0]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Ordenação por Nº de OS
  const [sortOrderOS, setSortOrderOS] = useState('none'); // 'none' | 'asc' | 'desc'

  useEffect(() => {
    fetchResponsaveis();
    loadCadastrosBancarios();
  }, []);

  const fetchResponsaveis = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('os_responsaveis')
      .select('*, ordens_servico(numero_os, endereco)')
      .order('nome');
    
    if (error) {
      console.error("Erro ao buscar responsáveis:", error);
      toast.error("Erro ao buscar registros de pagamentos");
    } else {
      setResponsaveis(data || []);
    }
    setIsLoading(false);
  };

  const loadCadastrosBancarios = async () => {
    try {
      const data = await fetchCadastrosBancarios();
      setCadastrosBancarios(data || []);
    } catch (err) {
      console.error("Erro ao carregar dados bancários:", err);
    }
  };

  // Mapa de cadastros bancários por nome normalizado (lowercase)
  const cadastrosMap = useMemo(() => {
    const map = {};
    (cadastrosBancarios || []).forEach(c => {
      if (c && c.nome) {
        map[c.nome.trim().toLowerCase()] = c;
      }
    });
    return map;
  }, [cadastrosBancarios]);

  const getRecordTotal = (r) => {
    return (parseMonetary(r.valor_freelance)) + 
           (parseMonetary(r.reembolso_conducao)) + 
           (parseMonetary(r.reembolso_alimentacao)) + 
           (parseMonetary(r.reembolso_hospedagem));
  };

  // Soma dos valores de todos os responsáveis selecionados
  const selectedSum = useMemo(() => {
    if (selectedIds.length === 0) return 0;
    const selectedSet = new Set(selectedIds);
    return responsaveis
      .filter(r => selectedSet.has(r.id))
      .reduce((acc, r) => acc + getRecordTotal(r), 0);
  }, [selectedIds, responsaveis]);

  const toggleExpand = (nome) => {
    setExpandedPessoas(prev => ({
      ...prev,
      [nome]: !prev[nome]
    }));
  };

  const toggleSortOS = () => {
    setSortOrderOS(prev => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  // Filtro individual
  const filteredRecords = useMemo(() => {
    return responsaveis.filter(r => {
      const matchSearch = (r.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (r.numero_os || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const st = r.status_pagamento || 'Pendente';
      let matchStatus = true;
      if (statusFilter !== 'TODOS') {
        matchStatus = st === statusFilter;
      }

      let matchDate = true;
      if (dataAgendamentoInicio) {
        matchDate = matchDate && r.agendamento && r.agendamento >= dataAgendamentoInicio;
      }
      if (dataAgendamentoFim) {
        matchDate = matchDate && r.agendamento && r.agendamento <= dataAgendamentoFim;
      }

      return matchSearch && matchStatus && matchDate;
    });
  }, [responsaveis, searchTerm, statusFilter, dataAgendamentoInicio, dataAgendamentoFim]);

  // Lista ordenada por Nº OS (se selecionado)
  const sortedFilteredRecords = useMemo(() => {
    if (sortOrderOS === 'none') return filteredRecords;
    return [...filteredRecords].sort((a, b) => {
      const numA = (a.numero_os || '').toString();
      const numB = (b.numero_os || '').toString();
      const cmp = numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
      return sortOrderOS === 'asc' ? cmp : -cmp;
    });
  }, [filteredRecords, sortOrderOS]);

  // Agrupamento por Responsável
  const groupedData = useMemo(() => {
    if (!agruparPorPessoa) return [];

    const map = {};
    sortedFilteredRecords.forEach(r => {
      const nome = r.nome || 'Sem Nome';
      const total = getRecordTotal(r);
      const st = r.status_pagamento || 'Pendente';

      if (!map[nome]) {
        map[nome] = {
          nome,
          osCount: 0,
          totalGeral: 0,
          totalPago: 0,
          totalPendente: 0,
          totalNaoSeAplica: 0,
          agendamentos: [],
          itens: []
        };
      }

      map[nome].osCount += 1;
      map[nome].totalGeral += total;
      if (st === 'Pago') {
        map[nome].totalPago += total;
      } else if (st === 'Não se aplica') {
        map[nome].totalNaoSeAplica += total;
      } else {
        map[nome].totalPendente += total;
      }

      if (r.agendamento) {
        map[nome].agendamentos.push(r.agendamento);
      }
      map[nome].itens.push(r);
    });

    return Object.values(map).map(p => {
      const sortedDates = [...p.agendamentos].sort();
      const sortedItens = sortOrderOS === 'none' ? p.itens : [...p.itens].sort((a, b) => {
        const numA = (a.numero_os || '').toString();
        const numB = (b.numero_os || '').toString();
        const cmp = numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
        return sortOrderOS === 'asc' ? cmp : -cmp;
      });

      return {
        ...p,
        itens: sortedItens,
        proximoAgendamento: sortedDates.length > 0 ? sortedDates[0] : null
      };
    });
  }, [sortedFilteredRecords, agruparPorPessoa, sortOrderOS]);

  // Bulk Actions Handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(sortedFilteredRecords.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  const handleSelectGroup = (itens, checked) => {
    const groupIds = itens.map(i => i.id);
    if (checked) {
      setSelectedIds(prev => Array.from(new Set([...prev, ...groupIds])));
    } else {
      setSelectedIds(prev => prev.filter(id => !groupIds.includes(id)));
    }
  };

  const aplicarBulkStatus = async () => {
    if (selectedIds.length === 0) {
      toast.warning('Selecione pelo menos um responsável para alterar o status.');
      return;
    }

    setIsBulkUpdating(true);
    try {
      const dataPgto = bulkStatus === 'Pago' ? (bulkDataPagamento || new Date().toISOString().split('T')[0]) : null;

      // 1. Tentar executar via RPC para auditoria completa
      const { error: rpcError } = await supabase.rpc('atualizar_status_responsaveis_em_massa', {
        p_ids: selectedIds,
        p_status: bulkStatus,
        p_data_pagamento: dataPgto
      });

      // 2. Fallback caso RPC ainda não exista no banco
      if (rpcError) {
        const updatePayload = {
          status_pagamento: bulkStatus,
          data_pagamento: dataPgto
        };

        const { error: fallbackError } = await supabase
          .from('os_responsaveis')
          .update(updatePayload)
          .in('id', selectedIds);

        if (fallbackError) throw fallbackError;
      }

      toast.success(`Status "${bulkStatus}" atribuído com sucesso para ${selectedIds.length} ${selectedIds.length === 1 ? 'responsável' : 'responsáveis'}!`);
      setSelectedIds([]);
      await fetchResponsaveis();
    } catch (err) {
      toast.error('Erro ao atualizar status dos responsáveis: ' + err.message);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Abertura do Modal de Dados Bancários
  const handleOpenBankModal = (nome, forceEdit = false) => {
    setActiveBankPerson(nome);
    const existing = cadastrosMap[nome.trim().toLowerCase()];

    if (existing) {
      setBankFormData({
        nome: existing.nome || nome,
        cpf_cnpj: existing.cpf_cnpj || '',
        banco: existing.banco || '',
        agencia: existing.agencia || '',
        conta: existing.conta || '',
        tipo_conta: existing.tipo_conta || 'Corrente',
        tipo_chave_pix: existing.tipo_chave_pix || 'Chave Aleatória',
        chave_pix: existing.chave_pix || '',
        titular: existing.titular || '',
        telefone: existing.telefone || '',
        email: existing.email || '',
        observacoes: existing.observacoes || ''
      });
      setIsEditingBank(forceEdit);
    } else {
      setBankFormData({
        nome: nome,
        cpf_cnpj: '',
        banco: '',
        agencia: '',
        conta: '',
        tipo_conta: 'Corrente',
        tipo_chave_pix: 'Chave Aleatória',
        chave_pix: '',
        titular: nome,
        telefone: '',
        email: '',
        observacoes: ''
      });
      setIsEditingBank(true);
    }
    setShowBankModal(true);
  };

  const handleSaveBankData = async (e) => {
    e?.preventDefault();
    if (!bankFormData.nome || !bankFormData.nome.trim()) {
      toast.error('O nome do responsável é obrigatório.');
      return;
    }

    setIsSavingBank(true);
    try {
      await saveCadastroBancario(bankFormData);
      await loadCadastrosBancarios();
      toast.success(`Dados bancários de ${bankFormData.nome} salvos com sucesso!`);
      setIsEditingBank(false);
    } catch (err) {
      toast.error('Erro ao salvar dados bancários: ' + err.message);
    } finally {
      setIsSavingBank(false);
    }
  };

  const handleCopyPix = (chave) => {
    if (!chave) {
      toast.warning('Nenhuma chave PIX cadastrada para copiar.');
      return;
    }
    navigator.clipboard.writeText(chave);
    toast.success('Chave PIX copiada para a área de transferência!');
  };

  const handleCopyAllBankData = (data) => {
    const formatted = formatDadosParaCopia(data);
    navigator.clipboard.writeText(formatted);
    toast.success('Todos os dados bancários copiados!');
  };

  const renderBadge = (status) => {
    const st = status || 'Pendente';
    if (st === 'Pago') {
      return (
        <span className="badge success">
          <CheckCircle size={12} style={{ marginRight: 4 }} /> Pago
        </span>
      );
    }
    if (st === 'Não se aplica') {
      return (
        <span className="badge neutral">
          <MinusCircle size={12} style={{ marginRight: 4 }} /> Não se aplica
        </span>
      );
    }
    return (
      <span className="badge warning">
        <Clock size={12} style={{ marginRight: 4 }} /> Pendente
      </span>
    );
  };

  return (
    <div className="lista-resp-container">
      <div className="lista-header">
        <div>
          <h2>Pagamentos da Equipe</h2>
          <p className="text-muted">Acompanhe os pagamentos da equipe por OS ou consolidados por pessoa e confira os dados bancários para transferências</p>
        </div>
      </div>

      <div className="card list-card">
        {/* Barra de Filtros */}
        <div className="resp-filter-bar">
          <div className="resp-search-filters">
            <div className="search-wrapper" style={{ minWidth: 260 }}>
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Buscar por nome ou número da OS..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="status-pills">
              {['TODOS', 'Pendente', 'Pago', 'Não se aplica'].map(st => (
                <button
                  key={st}
                  type="button"
                  className={`status-pill ${statusFilter === st ? 'active' : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st === 'TODOS' ? 'Todos os Status' : st}
                </button>
              ))}
            </div>

            <div className="date-filters">
              <div className="date-filter-group">
                <label>Agendado De:</label>
                <input 
                  type="date" 
                  value={dataAgendamentoInicio} 
                  onChange={(e) => setDataAgendamentoInicio(e.target.value)} 
                />
              </div>
              <div className="date-filter-group">
                <label>Até:</label>
                <input 
                  type="date" 
                  value={dataAgendamentoFim} 
                  onChange={(e) => setDataAgendamentoFim(e.target.value)} 
                />
              </div>
              {(dataAgendamentoInicio || dataAgendamentoFim) && (
                <button 
                  type="button" 
                  className="btn-clear-date"
                  onClick={() => { setDataAgendamentoInicio(''); setDataAgendamentoFim(''); }}
                  title="Limpar filtro de data de agendamento"
                >
                  Limpar Data
                </button>
              )}
            </div>
          </div>

          <div>
            <button
              type="button"
              className={`toggle-group-btn ${agruparPorPessoa ? 'active' : ''}`}
              onClick={() => setAgruparPorPessoa(!agruparPorPessoa)}
            >
              <Users size={16} />
              {agruparPorPessoa ? 'Visão Agrupada (Ativa)' : 'Agrupar por Responsável'}
            </button>
          </div>
        </div>

        {/* BARRA DE AÇÕES EM MASSA (Bulk Actions) COM EXIBIÇÃO CLARA DA SOMA DOS SELECIONADOS */}
        {selectedIds.length > 0 && (
          <div className="bulk-actions-bar">
            <div className="bulk-selected-info">
              <span className="bulk-count">
                {selectedIds.length} {selectedIds.length === 1 ? 'responsável selecionado' : 'responsáveis selecionados'}
              </span>
              <span className="bulk-sum-badge">
                <DollarSign size={16} color="#166534" />
                Soma Selecionada: <strong>{formatBRL(selectedSum)}</strong>
              </span>
            </div>

            <div className="bulk-controls">
              <select 
                value={bulkStatus} 
                onChange={(e) => setBulkStatus(e.target.value)}
                className="bulk-select"
                title="Status para atribuir aos selecionados"
              >
                <option value="Pago">Pago</option>
                <option value="Pendente">Pendente</option>
                <option value="Não se aplica">Não se aplica</option>
              </select>
              {bulkStatus === 'Pago' && (
                <div className="bulk-date-wrapper">
                  <label>Data Pgto:</label>
                  <input 
                    type="date" 
                    value={bulkDataPagamento} 
                    onChange={(e) => setBulkDataPagamento(e.target.value)} 
                    title="Data do pagamento"
                  />
                </div>
              )}
              <button 
                type="button"
                className="btn btn-primary" 
                onClick={aplicarBulkStatus}
                disabled={isBulkUpdating}
              >
                <CheckSquare size={16} />
                {isBulkUpdating ? 'Atualizando...' : `Atribuir "${bulkStatus}"`}
              </button>
              <button 
                type="button"
                className="btn-clear-selection"
                onClick={() => setSelectedIds([])}
                title="Desmarcar todos"
              >
                Desmarcar
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: '30px', textAlign: 'center' }}>Carregando pagamentos...</div>
        ) : agruparPorPessoa ? (
          /* TABELA AGRUPADA POR PESSOA */
          <div className="table-responsive">
            <table className="table data-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={sortedFilteredRecords.length > 0 && sortedFilteredRecords.every(r => selectedIds.includes(r.id))} 
                      onChange={handleSelectAll} 
                      title="Selecionar todos os responsáveis"
                    />
                  </th>
                  <th style={{ width: 30 }}></th>
                  <th>Responsável</th>
                  <th>Dados Bancários / PIX</th>
                  <th>Qtd. OSs</th>
                  <th>Total Geral</th>
                  <th>Já Pago</th>
                  <th>Pendente</th>
                  <th>Data Agendamento</th>
                </tr>
              </thead>
              <tbody>
                {groupedData.length > 0 ? groupedData.map((p) => {
                  const isExpanded = !!expandedPessoas[p.nome];
                  const groupSelectedCount = p.itens.filter(i => selectedIds.includes(i.id)).length;
                  const isGroupAllSelected = p.itens.length > 0 && groupSelectedCount === p.itens.length;
                  const isGroupIndeterminate = groupSelectedCount > 0 && !isGroupAllSelected;
                  const bankData = cadastrosMap[p.nome.trim().toLowerCase()];

                  return (
                    <Fragment key={p.nome}>
                      <tr 
                        onClick={() => toggleExpand(p.nome)} 
                        style={{ cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'white' }}
                        className={`table-hover-row ${isGroupAllSelected ? 'selected-row' : ''}`}
                        title="Clique para expandir/recolher as OSs deste profissional"
                      >
                        <td 
                          className="row-checkbox" 
                          style={{ textAlign: 'center' }} 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input 
                            type="checkbox" 
                            checked={isGroupAllSelected}
                            ref={el => { if (el) el.indeterminate = isGroupIndeterminate; }}
                            onChange={(e) => handleSelectGroup(p.itens, e.target.checked)}
                            title={isGroupAllSelected ? "Desmarcar todos deste responsável" : "Marcar todos deste responsável"}
                          />
                        </td>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </td>
                        <td className="fw-bold">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <User size={16} className="text-muted" />
                            {p.nome}
                          </div>
                        </td>

                        {/* COLUNA DADOS BANCÁRIOS / PIX */}
                        <td onClick={(e) => e.stopPropagation()}>
                          {bankData && (bankData.chave_pix || bankData.banco) ? (
                            <button
                              type="button"
                              className="btn-bank-badge has-data"
                              onClick={() => handleOpenBankModal(p.nome)}
                              title="Clique para conferir dados bancários / copiar PIX"
                            >
                              <Landmark size={14} color="#0284c7" />
                              <span className="bank-name-text">
                                {bankData.banco ? bankData.banco.split('-')[1]?.trim() || bankData.banco : 'Banco'}
                              </span>
                              {bankData.chave_pix && (
                                <span className="pix-tag">PIX</span>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-bank-badge no-data"
                              onClick={() => handleOpenBankModal(p.nome, true)}
                              title="Cadastrar informações bancárias deste profissional"
                            >
                              <CreditCard size={14} color="#94a3b8" />
                              <span>+ Dados Bancários</span>
                            </button>
                          )}
                        </td>

                        <td>
                          <span className="badge info">{p.osCount} {p.osCount === 1 ? 'OS' : 'OSs'}</span>
                        </td>
                        <td className="fw-bold">{formatBRL(p.totalGeral)}</td>
                        <td style={{ color: '#10b981', fontWeight: 600 }}>
                          {formatBRL(p.totalPago)}
                        </td>
                        <td style={{ color: p.totalPendente > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>
                          {formatBRL(p.totalPendente)}
                        </td>
                        <td>
                          {p.proximoAgendamento ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#334155' }}>
                              <Calendar size={13} color="#0084ff" />
                              {typeof p.proximoAgendamento === 'string' && p.proximoAgendamento.includes('-') ? p.proximoAgendamento.split('-').reverse().join('/') : p.proximoAgendamento}
                              {p.agendamentos.length > 1 && (
                                <span style={{ fontSize: 11, color: '#6b7280' }}> (+{p.agendamentos.length - 1})</span>
                              )}
                            </span>
                          ) : '-'}
                        </td>
                      </tr>

                      {/* SUBTABELA EXPANDIDA */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="9" style={{ padding: '0 15px 15px 15px', background: '#f8fafc' }}>
                            <div className="grouped-subtable">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <h5 style={{ margin: 0 }}>Ordens de Serviço de {p.nome}:</h5>
                                <button
                                  type="button"
                                  className="btn-link-bank"
                                  onClick={() => handleOpenBankModal(p.nome)}
                                >
                                  <Landmark size={14} /> Conferir Dados Bancários de {p.nome}
                                </button>
                              </div>
                              <table className="table" style={{ background: 'white', borderRadius: 6, overflow: 'hidden' }}>
                                <thead>
                                  <tr style={{ background: '#f1f5f9', fontSize: 12 }}>
                                    <th style={{ width: 40, textAlign: 'center' }}></th>
                                    <th 
                                      onClick={toggleSortOS} 
                                      style={{ cursor: 'pointer', userSelect: 'none' }}
                                      title="Clique para ordenar por Nº OS (crescente/decrescente)"
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>Nº OS</span>
                                        {sortOrderOS === 'asc' && <ArrowUp size={13} color="#0084ff" />}
                                        {sortOrderOS === 'desc' && <ArrowDown size={13} color="#0084ff" />}
                                        {sortOrderOS === 'none' && <ArrowUpDown size={13} color="#9ca3af" />}
                                      </div>
                                    </th>
                                    <th>Freelance</th>
                                    <th>Condução</th>
                                    <th>Alimentação</th>
                                    <th>Hospedagem</th>
                                    <th>Total da OS</th>
                                    <th>Agendamento</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Ação</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.itens.map((sub, sIdx) => {
                                    const subTotal = getRecordTotal(sub);
                                    const isSubSelected = selectedIds.includes(sub.id);
                                    return (
                                      <tr 
                                        key={sub.id || sIdx} 
                                        style={{ fontSize: 13 }}
                                        className={isSubSelected ? 'selected-row' : ''}
                                      >
                                        <td 
                                          className="row-checkbox" 
                                          style={{ textAlign: 'center' }} 
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <input 
                                            type="checkbox" 
                                            checked={isSubSelected} 
                                            onChange={(e) => handleSelectOne(sub.id, e.target.checked)} 
                                          />
                                        </td>
                                        <td className="fw-bold">{sub.numero_os}</td>
                                        <td>{formatBRL(sub.valor_freelance)}</td>
                                        <td>{formatBRL(sub.reembolso_conducao)}</td>
                                        <td>{formatBRL(sub.reembolso_alimentacao)}</td>
                                        <td>{formatBRL(sub.reembolso_hospedagem)}</td>
                                        <td className="fw-bold">{formatBRL(subTotal)}</td>
                                        <td>{sub.agendamento && typeof sub.agendamento === 'string' && sub.agendamento.includes('-') ? sub.agendamento.split('-').reverse().join('/') : (sub.agendamento || '-')}</td>
                                        <td>{renderBadge(sub.status_pagamento)}</td>
                                        <td style={{ textAlign: 'right' }}>
                                          <button
                                            type="button"
                                            className="action-btn"
                                            onClick={() => navigate(`/os-form?id=${sub.numero_os}&view=true`)}
                                            title="Ver OS completa"
                                          >
                                            <ArrowRight size={15} />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }) : (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>
                      Nenhum registro encontrado para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* TABELA INDIVIDUAL NORMAL */
          <div className="table-responsive">
            <table className="table data-table table-hover">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={sortedFilteredRecords.length > 0 && selectedIds.length === sortedFilteredRecords.length} 
                      onChange={handleSelectAll} 
                      title="Selecionar todos"
                    />
                  </th>
                  <th>Responsável</th>
                  <th>Dados Bancários</th>
                  <th 
                    onClick={toggleSortOS} 
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    title="Clique para ordenar por Nº OS (crescente/decrescente)"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Nº OS</span>
                      {sortOrderOS === 'asc' && <ArrowUp size={14} color="#0084ff" />}
                      {sortOrderOS === 'desc' && <ArrowDown size={14} color="#0084ff" />}
                      {sortOrderOS === 'none' && <ArrowUpDown size={14} color="#9ca3af" />}
                    </div>
                  </th>
                  <th>Valor Total</th>
                  <th>Data Agendamento</th>
                  <th>Status do Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {sortedFilteredRecords.length > 0 ? sortedFilteredRecords.map((r) => {
                  const total = getRecordTotal(r);
                  const isSelected = selectedIds.includes(r.id);
                  const bankData = cadastrosMap[(r.nome || '').trim().toLowerCase()];

                  return (
                    <tr 
                      key={r.id} 
                      onClick={() => navigate(`/os-form?id=${r.numero_os}&view=true`)} 
                      style={{ cursor: 'pointer' }} 
                      title="Clique para visualizar a OS"
                      className={isSelected ? 'selected-row' : ''}
                    >
                      <td 
                        className="row-checkbox" 
                        style={{ textAlign: 'center' }} 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={(e) => handleSelectOne(r.id, e.target.checked)} 
                        />
                      </td>
                      <td className="fw-bold">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <User size={16} className="text-muted" /> {r.nome}
                        </div>
                      </td>

                      {/* Botão de Dados Bancários na linha individual */}
                      <td onClick={(e) => e.stopPropagation()}>
                        {bankData && (bankData.chave_pix || bankData.banco) ? (
                          <button
                            type="button"
                            className="btn-bank-badge has-data"
                            onClick={() => handleOpenBankModal(r.nome)}
                            title="Conferir dados bancários / copiar chave PIX"
                          >
                            <Landmark size={14} color="#0284c7" />
                            <span>{bankData.banco ? bankData.banco.split('-')[1]?.trim() || bankData.banco : 'PIX'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-bank-badge no-data"
                            onClick={() => handleOpenBankModal(r.nome, true)}
                            title="Cadastrar dados bancários"
                          >
                            <CreditCard size={14} color="#94a3b8" />
                            <span>+ Cadastrar</span>
                          </button>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} className="text-muted" /> {r.numero_os}
                        </div>
                      </td>
                      <td className="fw-bold">{formatBRL(total)}</td>
                      <td>{r.agendamento ? r.agendamento.split('-').reverse().join('/') : '-'}</td>
                      <td>{renderBadge(r.status_pagamento)}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px' }}>
                      Nenhum pagamento encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: CONFERIR E GERENCIAR DADOS BANCÁRIOS DO RESPONSÁVEL */}
      {showBankModal && (
        <div className="modal-overlay" onClick={() => setShowBankModal(false)}>
          <div className="modal-content modal-banco" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Informações Bancárias para Pagamento</h3>
                <p className="text-muted" style={{ margin: '2px 0 0 0', fontSize: 13 }}>
                  Profissional: <strong>{activeBankPerson}</strong>
                </p>
              </div>
              <button className="btn-close" onClick={() => setShowBankModal(false)}><X size={20}/></button>
            </div>

            <div className="modal-body">
              {!isEditingBank && (bankFormData.chave_pix || bankFormData.banco || bankFormData.conta) ? (
                /* MODO VISUALIZAÇÃO / CONFERÊNCIA */
                <div className="bank-view-container">
                  {/* Bloco Chave PIX */}
                  <div className="pix-highlight-card">
                    <div className="pix-header">
                      <div className="pix-type-label">Chave PIX ({bankFormData.tipo_chave_pix || 'Chave'}):</div>
                      {bankFormData.chave_pix && (
                        <button
                          type="button"
                          className="btn-copy-pix"
                          onClick={() => handleCopyPix(bankFormData.chave_pix)}
                          title="Copiar apenas a chave PIX"
                        >
                          <Copy size={14} /> Copiar PIX
                        </button>
                      )}
                    </div>
                    <div className="pix-key-val">
                      {bankFormData.chave_pix || '(Nenhuma chave cadastrada)'}
                    </div>
                  </div>

                  {/* Detalhes Bancários da Conta */}
                  <div className="bank-details-grid">
                    <div className="bank-detail-item">
                      <span className="lbl">Banco:</span>
                      <span className="val fw-bold">{bankFormData.banco || '(Não informado)'}</span>
                    </div>
                    <div className="bank-detail-item">
                      <span className="lbl">Tipo de Conta:</span>
                      <span className="val">{bankFormData.tipo_conta || 'Corrente'}</span>
                    </div>
                    <div className="bank-detail-item">
                      <span className="lbl">Agência:</span>
                      <span className="val fw-bold">{bankFormData.agencia || '-'}</span>
                    </div>
                    <div className="bank-detail-item">
                      <span className="lbl">Conta com Dígito:</span>
                      <span className="val fw-bold">{bankFormData.conta || '-'}</span>
                    </div>
                    <div className="bank-detail-item">
                      <span className="lbl">Titular:</span>
                      <span className="val">{bankFormData.titular || bankFormData.nome}</span>
                    </div>
                    <div className="bank-detail-item">
                      <span className="lbl">CPF / CNPJ:</span>
                      <span className="val">{bankFormData.cpf_cnpj || '(Não informado)'}</span>
                    </div>
                  </div>

                  {bankFormData.observacoes && (
                    <div className="bank-obs-box">
                      <strong>Observações:</strong> {bankFormData.observacoes}
                    </div>
                  )}

                  {/* Ações de Cópia e Edição */}
                  <div className="bank-actions-footer">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => handleCopyAllBankData(bankFormData)}
                    >
                      <Copy size={16} /> Copiar Todos os Dados
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setIsEditingBank(true)}
                    >
                      <Edit3 size={16} /> Editar Dados Bancários
                    </button>
                  </div>
                </div>
              ) : (
                /* MODO CADASTRO / EDIÇÃO */
                <form onSubmit={handleSaveBankData} className="bank-form">
                  <div className="form-group mb-12">
                    <label className="fw-medium">Nome do Responsável:</label>
                    <input 
                      type="text" 
                      className="form-control"
                      value={bankFormData.nome}
                      onChange={(e) => setBankFormData({ ...bankFormData, nome: e.target.value })}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className="form-group">
                      <label className="fw-medium">CPF ou CNPJ:</label>
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="000.000.000-00"
                        value={bankFormData.cpf_cnpj}
                        onChange={(e) => setBankFormData({ ...bankFormData, cpf_cnpj: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="fw-medium">Telefone / WhatsApp:</label>
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="(00) 00000-0000"
                        value={bankFormData.telefone}
                        onChange={(e) => setBankFormData({ ...bankFormData, telefone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className="form-group">
                      <label className="fw-medium">Banco:</label>
                      <input 
                        type="text" 
                        className="form-control"
                        list="bancos-sugestoes"
                        placeholder="Ex: Nubank, Banco do Brasil..."
                        value={bankFormData.banco}
                        onChange={(e) => setBankFormData({ ...bankFormData, banco: e.target.value })}
                      />
                      <datalist id="bancos-sugestoes">
                        {BANCOS_COMUNS.map(b => (
                          <option key={b} value={b} />
                        ))}
                      </datalist>
                    </div>

                    <div className="form-group">
                      <label className="fw-medium">Tipo de Conta:</label>
                      <select 
                        className="form-control"
                        value={bankFormData.tipo_conta}
                        onChange={(e) => setBankFormData({ ...bankFormData, tipo_conta: e.target.value })}
                      >
                        <option value="Corrente">Corrente</option>
                        <option value="Poupança">Poupança</option>
                        <option value="Pagamento">Pagamento</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12, marginBottom: 12 }}>
                    <div className="form-group">
                      <label className="fw-medium">Agência (com dígito):</label>
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="0001"
                        value={bankFormData.agencia}
                        onChange={(e) => setBankFormData({ ...bankFormData, agencia: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="fw-medium">Conta com Dígito:</label>
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="1234567-8"
                        value={bankFormData.conta}
                        onChange={(e) => setBankFormData({ ...bankFormData, conta: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Bloco Chave PIX */}
                  <div className="pix-edit-fieldset">
                    <span className="fieldset-title">Configuração da Chave PIX</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 12, marginTop: 8 }}>
                      <div className="form-group">
                        <label className="fw-medium">Tipo da Chave:</label>
                        <select 
                          className="form-control"
                          value={bankFormData.tipo_chave_pix}
                          onChange={(e) => setBankFormData({ ...bankFormData, tipo_chave_pix: e.target.value })}
                        >
                          <option value="CPF/CNPJ">CPF / CNPJ</option>
                          <option value="Celular">Celular / Telefone</option>
                          <option value="E-mail">E-mail</option>
                          <option value="Chave Aleatória">Chave Aleatória</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="fw-medium">Chave PIX:</label>
                        <input 
                          type="text" 
                          className="form-control"
                          placeholder="Informe a chave PIX exata..."
                          value={bankFormData.chave_pix}
                          onChange={(e) => setBankFormData({ ...bankFormData, chave_pix: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group mb-12">
                    <label className="fw-medium">Titular da Conta (se diferente do responsável):</label>
                    <input 
                      type="text" 
                      className="form-control"
                      placeholder="Nome completo do titular da conta"
                      value={bankFormData.titular}
                      onChange={(e) => setBankFormData({ ...bankFormData, titular: e.target.value })}
                    />
                  </div>

                  <div className="form-group mb-15">
                    <label className="fw-medium">Observações adicionais para pagamento:</label>
                    <textarea 
                      rows="2"
                      className="form-control"
                      placeholder="Ex: Preferência pagamento via PIX celular; banco digital."
                      value={bankFormData.observacoes}
                      onChange={(e) => setBankFormData({ ...bankFormData, observacoes: e.target.value })}
                    />
                  </div>

                  <div className="modal-footer-edit">
                    {cadastrosMap[activeBankPerson.trim().toLowerCase()] && (
                      <button 
                        type="button" 
                        className="btn btn-outline" 
                        onClick={() => setIsEditingBank(false)}
                      >
                        Cancelar
                      </button>
                    )}
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={isSavingBank}
                    >
                      <Save size={16} />
                      {isSavingBank ? 'Salvando...' : 'Salvar Dados Bancários'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListaResponsaveis;
