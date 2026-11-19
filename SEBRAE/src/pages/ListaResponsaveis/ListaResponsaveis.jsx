import { useState, useEffect, useMemo, Fragment, useCallback } from 'react';
import { supabase } from '../../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { 
  Search, User, FileText, CheckCircle, Clock, MinusCircle, 
  Users, ChevronDown, ChevronRight, Calendar, ArrowRight,
  CheckSquare, ArrowUpDown, ArrowUp, ArrowDown, Landmark,
  DollarSign, CreditCard, RotateCcw, History, X
} from 'lucide-react';
import { formatBRL, parseMonetary, formatDateTime, todayLocalISO } from '../../utils/format';
import { fetchCadastrosBancarios } from '../../services/bancarioService';
import {
  undoAuditLog,
  fetchRecentUndoablePaymentLogs,
  getAcaoResumo,
  getUndoConfirmMessage
} from '../../services/auditService';
import ModalDadosBancarios from '../../components/ModalDadosBancarios/ModalDadosBancarios';
import './ListaResponsaveis.css';

const ListaResponsaveis = () => {
  const navigate = useNavigate();
  const { toast, confirmDialog } = useToast();
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

  // Bulk Actions & Undo
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('Pago');
  const [bulkDataPagamento, setBulkDataPagamento] = useState(todayLocalISO());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [recentPaymentLogs, setRecentPaymentLogs] = useState([]);
  const [lastUndoBanner, setLastUndoBanner] = useState(null);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  // Ordenação por Nº de OS
  const [sortOrderOS, setSortOrderOS] = useState('none'); // 'none' | 'asc' | 'desc'

  const fetchResponsaveis = useCallback(async () => {
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
  }, [toast]);

  const loadCadastrosBancarios = useCallback(async () => {
    try {
      const data = await fetchCadastrosBancarios();
      setCadastrosBancarios(data || []);
    } catch (err) {
      console.error("Erro ao carregar dados bancários:", err);
    }
  }, []);

  const loadRecentPaymentLogs = useCallback(async () => {
    const data = await fetchRecentUndoablePaymentLogs(10);
    setRecentPaymentLogs(data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchResponsaveis();
    loadCadastrosBancarios();
    loadRecentPaymentLogs();
  }, [fetchResponsaveis, loadCadastrosBancarios, loadRecentPaymentLogs]);

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

  const executeUndoPayload = useCallback(async (undoPayload, { askConfirm = false } = {}) => {
    if (!undoPayload) return;

    if (askConfirm) {
      const msg = undoPayload.log
        ? getUndoConfirmMessage(undoPayload.log)
        : `Deseja desfazer a atribuição de "${undoPayload.status}" para ${undoPayload.itens?.length || 0} pagamento(s) e restaurar o status anterior?`;
      const confirmed = await confirmDialog({
        title: 'Desfazer Alteração de Pagamentos',
        message: msg,
        confirmText: 'Sim, desfazer',
        cancelText: 'Cancelar',
        isDanger: true
      });
      if (!confirmed) return;
    }

    setIsUndoing(true);
    try {
      if (undoPayload.logId) {
        await undoAuditLog(undoPayload.logId);
      } else if (undoPayload.itens && undoPayload.itens.length > 0) {
        // Fallback local em sessão caso a RPC 009 ainda não esteja no banco
        for (const item of undoPayload.itens) {
          const { error: restoreErr } = await supabase
            .from('os_responsaveis')
            .update({
              status_pagamento: item.status_pagamento || 'Pendente',
              data_pagamento: item.data_pagamento || null
            })
            .eq('id', item.id);
          if (restoreErr) throw restoreErr;
        }
      }

      setLastUndoBanner(prev => {
        if (!prev) return null;
        if (undoPayload.logId && prev.logId === undoPayload.logId) return null;
        if (!undoPayload.logId && prev === undoPayload) return null;
        return prev;
      });

      toast.success('Alteração desfeita! Os pagamentos voltaram ao status anterior.');
      await Promise.all([fetchResponsaveis(), loadRecentPaymentLogs()]);
    } catch (err) {
      toast.error('Erro ao desfazer alteração: ' + err.message);
    } finally {
      setIsUndoing(false);
    }
  }, [confirmDialog, fetchResponsaveis, loadRecentPaymentLogs, toast]);

  const aplicarBulkStatus = async () => {
    if (selectedIds.length === 0) {
      toast.warning('Selecione pelo menos um responsável para alterar o status.');
      return;
    }

    setIsBulkUpdating(true);
    try {
      const dataPgto = bulkStatus === 'Pago' ? (bulkDataPagamento || todayLocalISO()) : null;
      const selectedSet = new Set(selectedIds);
      const snapshotItens = responsaveis
        .filter(r => selectedSet.has(r.id))
        .map(r => ({
          id: r.id,
          numero_os: r.numero_os,
          nome: r.nome,
          valor_total: getRecordTotal(r),
          status_pagamento: r.status_pagamento || 'Pendente',
          data_pagamento: r.data_pagamento || null
        }));

      const totalValorSelecionado = snapshotItens.reduce((acc, item) => acc + item.valor_total, 0);

      // 1. Tentar executar via RPC para auditoria completa
      const { data: rpcData, error: rpcError } = await supabase.rpc('atualizar_status_responsaveis_em_massa', {
        p_ids: selectedIds,
        p_status: bulkStatus,
        p_data_pagamento: dataPgto
      });

      // 2. Fallback caso RPC ainda não exista no banco
      if (rpcError) {
        console.warn('RPC atualizar_status_responsaveis_em_massa falhou, usando fallback direto:', rpcError);
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

      const logId = !rpcError && rpcData?.log_id ? rpcData.log_id : null;
      const undoPayload = {
        logId,
        status: bulkStatus,
        count: snapshotItens.length || selectedIds.length,
        totalValor: totalValorSelecionado,
        itens: snapshotItens,
        createdAt: new Date().toISOString()
      };

      setLastUndoBanner(undoPayload);
      setSelectedIds([]);
      await Promise.all([fetchResponsaveis(), loadRecentPaymentLogs()]);

      toast.success(
        `Status "${bulkStatus}" atribuído com sucesso para ${undoPayload.count} ${undoPayload.count === 1 ? 'pagamento' : 'pagamentos'} (${formatBRL(totalValorSelecionado)})!`,
        'Sucesso',
        {
          duration: 10000,
          action: {
            label: 'Desfazer',
            onClick: () => executeUndoPayload(undoPayload, { askConfirm: false })
          }
        }
      );
    } catch (err) {
      toast.error('Erro ao atualizar status dos responsáveis: ' + err.message);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Abertura do Modal de Dados Bancários
  const handleOpenBankModal = (nome, forceEdit = false) => {
    setActiveBankPerson(nome || '');
    setIsEditingBank(forceEdit);
    setShowBankModal(true);
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
        <div className="lista-header-actions">
          {recentPaymentLogs.length > 0 && (
            <button
              type="button"
              className="btn-undo-header"
              onClick={() => setShowUndoModal(true)}
              disabled={isUndoing}
              title="Ver alterações em massa recentes e desfazer rapidamente"
            >
              <History size={16} />
              <span>Desfazer Ações</span>
              <span className="undo-count-pill">{recentPaymentLogs.length}</span>
            </button>
          )}
        </div>
      </div>

      {/* BANNER RÁPIDO DE DESFAZER APÓS AÇÃO EM MASSA */}
      {lastUndoBanner && (
        <div className="undo-quick-banner">
          <div className="undo-quick-info">
            <RotateCcw size={18} className="undo-quick-icon" />
            <div>
              <strong>
                Última alteração: "{lastUndoBanner.status}" atribuído para {lastUndoBanner.count}{' '}
                {lastUndoBanner.count === 1 ? 'pagamento' : 'pagamentos'} ({formatBRL(lastUndoBanner.totalValor)})
              </strong>
              <div className="undo-quick-sub">
                {lastUndoBanner.itens.slice(0, 4).map(i => `${i.nome} (OS ${i.numero_os})`).join(' • ')}
                {lastUndoBanner.itens.length > 4 && ` • +${lastUndoBanner.itens.length - 4} outro(s)`}
              </div>
            </div>
          </div>
          <div className="undo-quick-actions">
            <button
              type="button"
              className="btn-undo-now"
              onClick={() => executeUndoPayload(lastUndoBanner, { askConfirm: false })}
              disabled={isUndoing}
            >
              <RotateCcw size={14} />
              {isUndoing ? 'Desfazendo...' : 'Desfazer agora'}
            </button>
            <button
              type="button"
              className="btn-undo-dismiss"
              onClick={() => setLastUndoBanner(null)}
              title="Fechar aviso"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

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
                            <div>
                              <div>{p.nome}</div>
                              {bankData?.email && (
                                <div style={{ fontSize: 11, fontWeight: 'normal', color: '#64748b' }}>
                                  {bankData.email}
                                </div>
                              )}
                            </div>
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
                          <User size={16} className="text-muted" />
                          <div>
                            <div>{r.nome}</div>
                            {bankData?.email && (
                              <div style={{ fontSize: 11, fontWeight: 'normal', color: '#64748b' }}>
                                {bankData.email}
                              </div>
                            )}
                          </div>
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

      {/* MODAL DE DADOS BANCÁRIOS UNIFICADO */}
      <ModalDadosBancarios 
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
        responsavel={activeBankPerson}
        initialData={cadastrosMap[activeBankPerson.trim().toLowerCase()] || null}
        forceEdit={isEditingBank}
        onSaveSuccess={async () => {
          await loadCadastrosBancarios();
        }}
      />

      {/* MODAL: HISTÓRICO DE PAGAMENTOS EM MASSA PARA DESFAZER */}
      {showUndoModal && (
        <div className="modal-overlay" onClick={() => setShowUndoModal(false)}>
          <div className="modal-content undo-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <History size={20} color="#0084ff" />
                <h3 style={{ margin: 0 }}>Alterações Recentes em Massa (Desfazer)</h3>
              </div>
              <button type="button" className="btn-close" onClick={() => setShowUndoModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto' }}>
              {recentPaymentLogs.length === 0 ? (
                <p className="text-muted" style={{ textAlign: 'center', padding: '20px 0' }}>
                  Nenhuma alteração em massa pendente de reversão encontrada.
                </p>
              ) : (
                <div className="undo-history-list">
                  {recentPaymentLogs.map(log => {
                    const itens = log.dados_antigos?.itens || [];
                    return (
                      <div key={log.id} className="undo-history-card">
                        <div className="undo-history-card-top">
                          <div>
                            <div className="undo-history-title">{getAcaoResumo(log)}</div>
                            <div className="undo-history-meta">
                              {formatDateTime(log.created_at)} • {log.user_email || 'Sistema'} • Log #{log.id}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-undo-card"
                            disabled={isUndoing}
                            onClick={async () => {
                              await executeUndoPayload({ logId: log.id, log }, { askConfirm: true });
                              setShowUndoModal(false);
                            }}
                          >
                            <RotateCcw size={14} />
                            Desfazer
                          </button>
                        </div>
                        {itens.length > 0 && (
                          <div className="undo-history-items">
                            {itens.map((item, idx) => (
                              <span key={`${item.id || idx}-${item.numero_os}`} className="undo-item-chip">
                                <strong>{item.nome}</strong> • OS {item.numero_os} • {formatBRL(item.valor_total)}{' '}
                                <em className="undo-item-prev">
                                  (era {item.status_pagamento || 'Pendente'})
                                </em>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListaResponsaveis;
