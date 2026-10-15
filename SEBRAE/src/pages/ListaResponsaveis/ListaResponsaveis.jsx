import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '../../supabase';
import { useNavigate } from 'react-router-dom';
import { 
  Search, User, FileText, CheckCircle, Clock, MinusCircle, 
  Users, ChevronDown, ChevronRight, Calendar, ArrowRight 
} from 'lucide-react';
import './ListaResponsaveis.css';

const ListaResponsaveis = () => {
  const navigate = useNavigate();
  const [responsaveis, setResponsaveis] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [agruparPorPessoa, setAgruparPorPessoa] = useState(false);
  const [expandedPessoas, setExpandedPessoas] = useState({});
  const [isLoading, setIsLoading] = useState(true);

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
      return matchSearch && matchStatus;
    });
  }, [responsaveis, searchTerm, statusFilter]);

  // Agrupamento por Responsável
  const groupedData = useMemo(() => {
    if (!agruparPorPessoa) return [];

    const map = {};
    filteredRecords.forEach(r => {
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
      return {
        ...p,
        proximoAgendamento: sortedDates.length > 0 ? sortedDates[0] : null
      };
    });
  }, [filteredRecords, agruparPorPessoa]);

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

        {isLoading ? (
          <div style={{ padding: '30px', textAlign: 'center' }}>Carregando pagamentos...</div>
        ) : agruparPorPessoa ? (
          /* TABELA AGRUPADA POR PESSOA */
          <div className="table-responsive">
            <table className="table data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
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
                  return (
                    <Fragment key={p.nome}>
                      <tr 
                        onClick={() => toggleExpand(p.nome)} 
                        style={{ cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'white' }}
                        className="table-hover-row"
                        title="Clique para expandir/recolher as OSs deste profissional"
                      >
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
                          <td colSpan="7" style={{ padding: '0 15px 15px 15px', background: '#f8fafc' }}>
                            <div className="grouped-subtable">
                              <h5>Ordens de Serviço de {p.nome}:</h5>
                              <table className="table" style={{ background: 'white', borderRadius: 6, overflow: 'hidden' }}>
                                <thead>
                                  <tr style={{ background: '#f1f5f9', fontSize: 12 }}>
                                    <th>Nº OS</th>
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
                                    return (
                                      <tr key={sIdx} style={{ fontSize: 13 }}>
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
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px' }}>
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
                  <th>Responsável</th>
                  <th>Nº OS</th>
                  <th>Valor Total (R$)</th>
                  <th>Data Agendamento</th>
                  <th>Status do Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length > 0 ? filteredRecords.map((r, i) => {
                  const total = getRecordTotal(r);
                  return (
                    <tr 
                      key={i} 
                      onClick={() => navigate(`/os-form?id=${r.numero_os}&view=true`)} 
                      style={{ cursor: 'pointer' }} 
                      title="Clique para visualizar a OS"
                    >
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
                    <td colSpan="5" style={{ textAlign: 'center', padding: '30px' }}>
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
