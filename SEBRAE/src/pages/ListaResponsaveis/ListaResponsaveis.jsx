import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '../../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { 
  Search, User, FileText, CheckCircle, Clock, MinusCircle, 
  Users, ChevronDown, ChevronRight, Calendar, ArrowRight,
  CheckSquare, ArrowUpDown, ArrowUp, ArrowDown, Landmark,
  DollarSign
} from 'lucide-react';
import { formatBRL, parseMonetary } from '../../utils/format';
import { fetchCadastrosBancarios } from '../../services/bancarioService';
import ModalDadosBancarios from '../../components/ModalDadosBancarios/ModalDadosBancarios';
import './ListaResponsaveis.css';

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
    </div>
  );
};

export default ListaResponsaveis;
