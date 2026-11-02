import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { 
  FileSpreadsheet, Archive, Plus, Search, Calendar, 
  DollarSign, TrendingUp, Activity, FileText, CheckCircle, 
  Printer, Trash2, Eye, X, ArrowLeft, RefreshCw, AlertCircle 
} from 'lucide-react';
import { formatBRL, parseMonetary } from '../../utils/format';
import { 
  fetchRelatoriosMensais, 
  salvarRelatorioMensal, 
  deleteRelatorioMensal, 
  setActiveDashboardPeriod, 
  MESES_NOMES 
} from '../../services/relatoriosService';
import './Relatorios.css';

const Relatorios = () => {
  const navigate = useNavigate();
  const { toast, confirmDialog } = useToast();

  const [relatorios, setRelatorios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroAno, setFiltroAno] = useState('TODOS');

  // Modal de Detalhes do Relatório
  const [selectedRelatorio, setSelectedRelatorio] = useState(null);

  // Modal de Novo Fechamento
  const [showNovoModal, setShowNovoModal] = useState(false);
  const [novoMes, setNovoMes] = useState(new Date().getMonth() + 1);
  const [novoAno, setNovoAno] = useState(new Date().getFullYear());
  const [novoNotas, setNovoNotas] = useState('');
  const [reiniciarCardsApos, setReiniciarCardsApos] = useState(true);
  const [previewStats, setPreviewStats] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadRelatorios();
  }, []);

  const loadRelatorios = async () => {
    setIsLoading(true);
    try {
      const data = await fetchRelatoriosMensais();
      setRelatorios(data || []);
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
      toast.error('Erro ao carregar relatórios');
    } finally {
      setIsLoading(false);
    }
  };

  const calcularPreview = async () => {
    setLoadingPreview(true);
    try {
      const { data: ordens, error } = await supabase
        .from('ordens_servico')
        .select('*, os_responsaveis(*)');

      if (error) throw error;

      let fat = 0, custo = 0, lucro = 0, caPend = 0, pagPend = 0;
      const osFiltradas = (ordens || []).filter(os => {
        if (!os.created_at) return false;
        const d = new Date(os.created_at);
        return d.getFullYear() === Number(novoAno) && (d.getMonth() + 1) === Number(novoMes);
      });

      osFiltradas.forEach(os => {
        fat += parseMonetary(os.valor_unitario_total);
        custo += parseMonetary(os.curso_responsavel) + parseMonetary(os.valor_iss);
        lucro += parseMonetary(os.lucro_previsto);
        if (os.status_conta_azul !== 'Concluído') caPend += 1;

        if (os.os_responsaveis) {
          os.os_responsaveis.forEach(r => {
            if (r.status_pagamento !== 'Pago' && r.status_pagamento !== 'Não se aplica') {
              pagPend += 1;
            }
          });
        }
      });

      const margem = fat > 0 ? (lucro / fat) * 100 : 0;

      setPreviewStats({
        faturado: fat,
        custos: custo,
        lucro,
        margem,
        totalOS: osFiltradas.length,
        caPend,
        pagPend,
        ordens: osFiltradas
      });
    } catch (err) {
      console.error('Erro no preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Preview de dados para o novo fechamento
  useEffect(() => {
    if (showNovoModal) {
      calcularPreview();
    }
  }, [showNovoModal, novoMes, novoAno]);

  const handleSalvarNovo = async () => {
    if (!previewStats) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        titulo: `Fechamento ${MESES_NOMES[novoMes - 1]} / ${novoAno}`,
        mes: Number(novoMes),
        ano: Number(novoAno),
        periodo_inicio: `${novoAno}-${String(novoMes).padStart(2, '0')}-01`,
        periodo_fim: `${novoAno}-${String(novoMes).padStart(2, '0')}-${new Date(novoAno, novoMes, 0).getDate()}`,
        total_faturado: previewStats.faturado,
        total_custos: previewStats.custos,
        lucro_total: previewStats.lucro,
        margem_media: previewStats.margem,
        total_os: previewStats.totalOS,
        conta_azul_pendentes: previewStats.caPend,
        pagamentos_pendentes: previewStats.pagPend,
        observacoes: novoNotas,
        fechado_por: user?.email || 'Administrador',
        dados_snapshot: {
          ordens: previewStats.ordens.map(o => ({
            numero_os: o.numero_os,
            nome_os: o.nome_os || o.endereco,
            cidade: o.cidade,
            valor: parseMonetary(o.valor_unitario_total),
            custo: parseMonetary(o.curso_responsavel) + parseMonetary(o.valor_iss),
            lucro: parseMonetary(o.lucro_previsto),
            conta_azul: o.status_conta_azul
          }))
        }
      };

      await salvarRelatorioMensal(payload);
      toast.success('Relatório mensal gerado com sucesso!');
      setShowNovoModal(false);
      setNovoNotas('');
      await loadRelatorios();

      if (reiniciarCardsApos) {
        const nextDate = new Date(novoAno, novoMes, 1);
        setActiveDashboardPeriod({
          tipo: 'mes_atual',
          ano: nextDate.getFullYear(),
          mes: nextDate.getMonth() + 1,
          label: `${MESES_NOMES[nextDate.getMonth()]} de ${nextDate.getFullYear()}`
        });
        toast.info('Cards do dashboard atualizados para o novo ciclo.');
      }
    } catch (err) {
      toast.error('Erro ao salvar relatório: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (r) => {
    const confirmed = await confirmDialog({
      title: 'Excluir Relatório',
      message: `Tem certeza que deseja excluir o "${r.titulo}"? Esta ação removerá o histórico arquivado deste fechamento.`,
      confirmText: 'Sim, excluir',
      cancelText: 'Cancelar',
      isDanger: true
    });

    if (!confirmed) return;

    try {
      await deleteRelatorioMensal(r.id);
      setRelatorios(prev => prev.filter(item => item.id !== r.id));
      if (selectedRelatorio && selectedRelatorio.id === r.id) {
        setSelectedRelatorio(null);
      }
      toast.success('Relatório removido com sucesso!');
    } catch (err) {
      toast.error('Erro ao excluir relatório: ' + err.message);
    }
  };

  // Anos disponíveis para filtro
  const anosDisponiveis = useMemo(() => {
    const set = new Set();
    relatorios.forEach(r => { if (r.ano) set.add(r.ano); });
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [relatorios]);

  // Relatórios filtrados
  const filteredRelatorios = useMemo(() => {
    return relatorios.filter(r => {
      const matchSearch = (r.titulo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (r.mes_nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (r.fechado_por || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchAno = filtroAno === 'TODOS' || String(r.ano) === String(filtroAno);

      return matchSearch && matchAno;
    });
  }, [relatorios, searchTerm, filtroAno]);

  // KPIs consolidados de todos os relatórios
  const totalizadores = useMemo(() => {
    let fat = 0, lucro = 0, totalOS = 0;
    relatorios.forEach(r => {
      fat += parseMonetary(r.total_faturado);
      lucro += parseMonetary(r.lucro_total);
      totalOS += Number(r.total_os) || 0;
    });
    return { fat, lucro, totalOS, qtdRelatorios: relatorios.length };
  }, [relatorios]);

  return (
    <div className="relatorios-container">
      {/* HEADER DA PÁGINA */}
      <div className="relatorios-header">
        <div>
          <h2>Relatórios e Fechamentos Mensais</h2>
          <p className="text-muted">Consulte os fechamentos anteriores, acompanhe o histórico financeiro e reinicie os ciclos de apuração</p>
        </div>
        <div className="relatorios-header-actions">
          <button 
            type="button" 
            className="btn btn-outline"
            onClick={() => navigate('/dashboard')}
            title="Voltar ao Dashboard"
          >
            <ArrowLeft size={16} />
            <span>Voltar ao Dashboard</span>
          </button>

          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => setShowNovoModal(true)}
            title="Gerar fechamento de um mês específico"
          >
            <Plus size={16} />
            <span>Novo Fechamento Mensal</span>
          </button>
        </div>
      </div>

      {/* CARDS RESUMO DO HISTÓRICO */}
      <div className="grid-3 mb-20">
        <div className="stat-card">
          <div className="stat-icon bg-blue"><Archive size={24} color="#0084ff" /></div>
          <div className="stat-info">
            <span className="stat-label">Fechamentos Arquivados</span>
            <span className="stat-value">{totalizadores.qtdRelatorios} {totalizadores.qtdRelatorios === 1 ? 'mês' : 'meses'}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-orange"><DollarSign size={24} color="#f59e0b" /></div>
          <div className="stat-info">
            <span className="stat-label">Total Faturado Arquivado</span>
            <span className="stat-value">{formatBRL(totalizadores.fat)}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-green"><TrendingUp size={24} color="#10b981" /></div>
          <div className="stat-info">
            <span className="stat-label">Lucro Total Consolidado</span>
            <span className="stat-value text-success">{formatBRL(totalizadores.lucro)}</span>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="card relatorios-filter-bar mb-20">
        <div className="search-wrapper" style={{ flex: 1, minWidth: 260 }}>
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Buscar por mês, título ou responsável pelo fechamento..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filtro-ano-wrapper">
          <label>Ano:</label>
          <select value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)}>
            <option value="TODOS">Todos os anos</option>
            {anosDisponiveis.map(ano => (
              <option key={ano} value={ano}>{ano}</option>
            ))}
          </select>
        </div>

        <button 
          type="button" 
          className="btn-icon-subtle"
          onClick={loadRelatorios}
          title="Recarregar relatórios"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* LISTAGEM DE RELATÓRIOS */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Carregando relatórios...</div>
      ) : filteredRelatorios.length > 0 ? (
        <div className="relatorios-grid">
          {filteredRelatorios.map((r) => (
            <div key={r.id} className="relatorio-card">
              <div className="relatorio-card-header">
                <div>
                  <h4>{r.titulo || `Fechamento ${r.mes_nome}/${r.ano}`}</h4>
                  <span className="relatorio-badge-periodo">
                    <Calendar size={12} /> {r.periodo_inicio ? r.periodo_inicio.split('-').reverse().join('/') : '-'} até {r.periodo_fim ? r.periodo_fim.split('-').reverse().join('/') : '-'}
                  </span>
                </div>
                <div className="relatorio-card-actions">
                  <button 
                    type="button" 
                    className="action-btn"
                    onClick={() => setSelectedRelatorio(r)}
                    title="Ver detalhes completos do relatório"
                  >
                    <Eye size={16} />
                  </button>
                  <button 
                    type="button" 
                    className="action-btn delete"
                    onClick={() => handleDelete(r)}
                    title="Excluir este relatório arquivado"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="relatorio-card-body">
                <div className="relatorio-metric-row">
                  <span className="metric-lbl">Total Faturado</span>
                  <span className="metric-val">{formatBRL(r.total_faturado)}</span>
                </div>
                <div className="relatorio-metric-row">
                  <span className="metric-lbl">Custos Totais</span>
                  <span className="metric-val text-orange">{formatBRL(r.total_custos)}</span>
                </div>
                <div className="relatorio-metric-row highlight">
                  <span className="metric-lbl">Lucro Previsto</span>
                  <span className="metric-val text-success">{formatBRL(r.lucro_total)}</span>
                </div>
                <div className="relatorio-submetrics">
                  <span>Margem: <strong>{(Number(r.margem_media) || 0).toFixed(1)}%</strong></span>
                  <span>OSs: <strong>{r.total_os || 0}</strong></span>
                </div>

                {r.observacoes && (
                  <div className="relatorio-notas">
                    "{r.observacoes}"
                  </div>
                )}
              </div>

              <div className="relatorio-card-footer">
                <span className="text-muted" style={{ fontSize: 11 }}>
                  Fechado em: {r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '-'}
                </span>
                <button 
                  type="button" 
                  className="btn-ver-detalhes"
                  onClick={() => setSelectedRelatorio(r)}
                >
                  Ver Relatório Completo
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-relatorios card">
          <FileSpreadsheet size={48} color="#94a3b8" style={{ marginBottom: 15 }} />
          <h3>Nenhum relatório encontrado</h3>
          <p className="text-muted">
            Ao final de cada mês, você pode fechar o período no Dashboard ou clicar no botão abaixo para gerar e arquivar o relatório deste período.
          </p>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => setShowNovoModal(true)}
            style={{ marginTop: 15 }}
          >
            <Plus size={16} />
            <span>Gerar Primeiro Fechamento</span>
          </button>
        </div>
      )}

      {/* MODAL: DETALHES DO RELATÓRIO MENSAL (VISUALIZAÇÃO / IMPRESSÃO) */}
      {selectedRelatorio && (
        <div className="modal-overlay" onClick={() => setSelectedRelatorio(null)}>
          <div className="modal-content modal-relatorio-view" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{selectedRelatorio.titulo}</h3>
                <p className="text-muted" style={{ margin: '2px 0 0 0', fontSize: 13 }}>
                  Período: {selectedRelatorio.periodo_inicio ? selectedRelatorio.periodo_inicio.split('-').reverse().join('/') : '-'} até {selectedRelatorio.periodo_fim ? selectedRelatorio.periodo_fim.split('-').reverse().join('/') : '-'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  onClick={() => window.print()}
                  title="Imprimir relatório"
                >
                  <Printer size={16} />
                  <span>Imprimir / PDF</span>
                </button>
                <button className="btn-close" onClick={() => setSelectedRelatorio(null)}><X size={20}/></button>
              </div>
            </div>

            <div className="modal-body printable-report-body">
              {/* Header Imprimível */}
              <div className="print-header">
                <h2>DEMONSTRATIVO DE RESULTADOS MENSAL</h2>
                <h4>{selectedRelatorio.titulo}</h4>
                <div className="print-meta">
                  <span>Fechamento realizado por: <strong>{selectedRelatorio.fechado_por || 'Sistema'}</strong></span>
                  <span>Data: <strong>{selectedRelatorio.created_at ? new Date(selectedRelatorio.created_at).toLocaleString('pt-BR') : '-'}</strong></span>
                </div>
              </div>

              {/* Grid de Totais */}
              <div className="report-kpi-grid">
                <div className="report-kpi-box">
                  <span className="lbl">Faturamento Total</span>
                  <span className="val text-primary">{formatBRL(selectedRelatorio.total_faturado)}</span>
                </div>
                <div className="report-kpi-box">
                  <span className="lbl">Custos Totais</span>
                  <span className="val text-orange">{formatBRL(selectedRelatorio.total_custos)}</span>
                </div>
                <div className="report-kpi-box highlight">
                  <span className="lbl">Lucro Previsto</span>
                  <span className="val text-success">{formatBRL(selectedRelatorio.lucro_total)}</span>
                </div>
                <div className="report-kpi-box">
                  <span className="lbl">Margem de Lucro</span>
                  <span className="val">{(Number(selectedRelatorio.margem_media) || 0).toFixed(1)}%</span>
                </div>
                <div className="report-kpi-box">
                  <span className="lbl">Quantidade de OSs</span>
                  <span className="val">{selectedRelatorio.total_os || 0}</span>
                </div>
                <div className="report-kpi-box">
                  <span className="lbl">Pagamentos Pendentes</span>
                  <span className="val text-danger">{selectedRelatorio.pagamentos_pendentes || 0}</span>
                </div>
              </div>

              {/* Observações */}
              {selectedRelatorio.observacoes && (
                <div className="report-notes-box">
                  <strong>Observações do Fechamento:</strong>
                  <p>{selectedRelatorio.observacoes}</p>
                </div>
              )}

              {/* Tabela de OSs arquivadas neste fechamento */}
              {selectedRelatorio.dados_snapshot?.ordens && selectedRelatorio.dados_snapshot.ordens.length > 0 && (
                <div className="report-table-section">
                  <h5>Ordens de Serviço do Período ({selectedRelatorio.dados_snapshot.ordens.length})</h5>
                  <div className="table-responsive">
                    <table className="table data-table">
                      <thead>
                        <tr>
                          <th>Nº OS</th>
                          <th>Cliente / Projeto</th>
                          <th>Cidade</th>
                          <th>Valor Faturado</th>
                          <th>Custo</th>
                          <th>Lucro Previsto</th>
                          <th>Conta Azul</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRelatorio.dados_snapshot.ordens.map((os, idx) => (
                          <tr key={idx}>
                            <td className="fw-bold">{os.numero_os}</td>
                            <td>{os.nome_os || '-'}</td>
                            <td>{os.cidade || '-'}</td>
                            <td>{formatBRL(os.valor)}</td>
                            <td>{formatBRL(os.custo)}</td>
                            <td className="fw-bold text-success">{formatBRL(os.lucro)}</td>
                            <td>
                              <span className={`badge ${os.conta_azul === 'Concluído' ? 'success' : 'warning'}`}>
                                {os.conta_azul || 'Pendente'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVO FECHAMENTO MENSAL MANUAL */}
      {showNovoModal && (
        <div className="modal-overlay" onClick={() => setShowNovoModal(false)}>
          <div className="modal-content modal-novo-fechamento" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Gerar Novo Fechamento Mensal</h3>
              <button className="btn-close" onClick={() => setShowNovoModal(false)}><X size={20}/></button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 15, marginBottom: 15 }}>
                <div className="form-group">
                  <label className="fw-medium">Mês de Fechamento:</label>
                  <select 
                    value={novoMes} 
                    onChange={(e) => setNovoMes(Number(e.target.value))}
                    className="form-control"
                  >
                    {MESES_NOMES.map((m, idx) => (
                      <option key={idx + 1} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="fw-medium">Ano:</label>
                  <select 
                    value={novoAno} 
                    onChange={(e) => setNovoAno(Number(e.target.value))}
                    className="form-control"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preview dos Resultados Calculados */}
              <div className="fechamento-preview-container">
                <span className="preview-title">Prévia dos Resultados ({MESES_NOMES[novoMes - 1]} / {novoAno}):</span>
                {loadingPreview ? (
                  <div style={{ padding: '15px', textAlign: 'center' }}>Calculando dados do período...</div>
                ) : previewStats ? (
                  <div className="fechamento-summary-box">
                    <div className="summary-item">
                      <span className="summary-lbl">Faturamento</span>
                      <span className="summary-val text-primary">{formatBRL(previewStats.faturado)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-lbl">Custos</span>
                      <span className="summary-val text-orange">{formatBRL(previewStats.custos)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-lbl">Lucro Previsto</span>
                      <span className="summary-val text-success">{formatBRL(previewStats.lucro)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-lbl">Qtd. OSs</span>
                      <span className="summary-val">{previewStats.totalOS}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="form-group mb-15">
                <label className="fw-medium">Observações do Fechamento (opcional):</label>
                <textarea 
                  rows="3"
                  className="form-control"
                  placeholder="Ex: Todas as OSs do mês foram concluídas e conferidas."
                  value={novoNotas}
                  onChange={(e) => setNovoNotas(e.target.value)}
                />
              </div>

              <div className="checkbox-option-box">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={reiniciarCardsApos}
                    onChange={(e) => setReiniciarCardsApos(e.target.checked)}
                  />
                  <span>
                    <strong>Reiniciar os cards do dashboard</strong> após salvar para o ciclo subsequente.
                  </span>
                </label>
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '15px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => setShowNovoModal(false)}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleSalvarNovo}
                disabled={isSaving || loadingPreview}
              >
                <Archive size={16} />
                {isSaving ? 'Salvando...' : 'Salvar Fechamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Relatorios;
