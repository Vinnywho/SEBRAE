import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '../../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { 
  Search, User, FileText, CheckCircle, Clock, MinusCircle, 
  Users, ChevronDown, ChevronRight, Calendar, ArrowRight,
  CheckSquare, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
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

  // Bulk Actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('Pago');
  const [bulkDataPagamento, setBulkDataPagamento] = useState(new Date().toISOString().split('T')[0]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Ordenação por Nº de OS
  const [sortOrderOS, setSortOrderOS] = useState('none'); // 'none' | 'asc' | 'desc'

  useEffect(() => {
    fetchResponsaveis();
  }, []);

  const fetchResponsaveis = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('os_responsaveis')
      .select('*, ordens_servico(numero_os, endereco)')
      .order('nome');
    
    if (error) {
      console.error("Erro ao buscar responsáveis:", error);
    } else {
      setResponsaveis(data || []);
    }
    setIsLoading(false);
  };

  const getRecordTotal = (r) => {
    return (Number(r.valor_freelance) || 0) + 
           (Number(r.reembolso_conducao) || 0) + 
           (Number(r.reembolso_alimentacao) || 0) + 
           (Number(r.reembolso_hospedagem) || 0);
  };

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
      // Ordena agendamentos do mais recente ou futuro
      const sortedDates = [...p.agendamentos].sort();
      // Ordena itens pela ordem do sortOrderOS se especificado
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
      const updatePayload = {
        status_pagamento: bulkStatus
      };
      if (bulkStatus === 'Pago') {
        updatePayload.data_pagamento = bulkDataPagamento || new Date().toISOString().split('T')[0];
      } else {
        updatePayload.data_pagamento = null;
      }

      const { error } = await supabase
        .from('os_responsaveis')
        .update(updatePayload)
        .in('id', selectedIds);

      if (error) throw error;

      toast.success(`Status "${bulkStatus}" atribuído com sucesso para ${selectedIds.length} ${selectedIds.length === 1 ? 'responsável' : 'responsáveis'}!`);
      setSelectedIds([]);
      await fetchResponsaveis();
    } catch (err) {
      toast.error('Erro ao atualizar status dos responsáveis: ' + err.message);
    } finally {
      setIsBulkUpdating(false);
    }
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
          <p className="text-muted">Acompanhe os valores a pagar para os responsáveis por OS ou consolidados por pessoa</p>
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

        {/* BARRA DE AÇÕES EM MASSA (Bulk Actions) */}
        {selectedIds.length > 0 && (
          <div className="bulk-actions-bar">
            <span className="bulk-count">
              {selectedIds.length} {selectedIds.length === 1 ? 'responsável selecionado' : 'responsáveis selecionados'}
            </span>
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
                        <td>
                          <span className="badge info">{p.osCount} {p.osCount === 1 ? 'OS' : 'OSs'}</span>
                        </td>
                        <td className="fw-bold">R$ {p.totalGeral.toFixed(2).replace('.', ',')}</td>
                        <td style={{ color: '#10b981', fontWeight: 600 }}>
                          R$ {p.totalPago.toFixed(2).replace('.', ',')}
                        </td>
                        <td style={{ color: p.totalPendente > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>
                          R$ {p.totalPendente.toFixed(2).replace('.', ',')}
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
                          <td colSpan="8" style={{ padding: '0 15px 15px 15px', background: '#f8fafc' }}>
                            <div className="grouped-subtable">
                              <h5>Ordens de Serviço de {p.nome}:</h5>
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
                                        <td>R$ {(Number(sub.valor_freelance) || 0).toFixed(2).replace('.', ',')}</td>
                                        <td>R$ {(Number(sub.reembolso_conducao) || 0).toFixed(2).replace('.', ',')}</td>
                                        <td>R$ {(Number(sub.reembolso_alimentacao) || 0).toFixed(2).replace('.', ',')}</td>
                                        <td>R$ {(Number(sub.reembolso_hospedagem) || 0).toFixed(2).replace('.', ',')}</td>
                                        <td className="fw-bold">R$ {subTotal.toFixed(2).replace('.', ',')}</td>
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
                    <td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>
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
                  <th>Valor Total (R$)</th>
                  <th>Data Agendamento</th>
                  <th>Status do Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {sortedFilteredRecords.length > 0 ? sortedFilteredRecords.map((r) => {
                  const total = getRecordTotal(r);
                  const isSelected = selectedIds.includes(r.id);
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
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} className="text-muted" /> {r.numero_os}
                        </div>
                      </td>
                      <td>R$ {total.toFixed(2).replace('.', ',')}</td>
                      <td>{r.agendamento ? r.agendamento.split('-').reverse().join('/') : '-'}</td>
                      <td>{renderBadge(r.status_pagamento)}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px' }}>
                      Nenhum pagamento encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ListaResponsaveis;
