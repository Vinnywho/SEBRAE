import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase";
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { 
  TrendingUp, DollarSign, Activity, FileText, CheckCircle, X, 
  ExternalLink, ArrowRight, Users, Calendar, RotateCcw, 
  Archive, FileSpreadsheet, AlertCircle 
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatBRL, parseMonetary } from '../../utils/format';
import { 
  getActiveDashboardPeriod, 
  setActiveDashboardPeriod, 
  salvarRelatorioMensal, 
  MESES_NOMES 
} from '../../services/relatoriosService';
import "./Dashboard.css";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast, confirmDialog } = useToast();
  
  const [allOS, setAllOS] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Período selecionado
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const act = getActiveDashboardPeriod();
    return `${act.ano}-${String(act.mes).padStart(2, '0')}`;
  });

  const [availablePeriods, setAvailablePeriods] = useState([]);
  
  // Modais de detalhamento
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);

  // Modal de Fechamento do Período
  const [showFechamentoModal, setShowFechamentoModal] = useState(false);
  const [fechamentoNotas, setFechamentoNotas] = useState('');
  const [reiniciarAposFechamento, setReiniciarAposFechamento] = useState(true);
  const [isSavingFechamento, setIsSavingFechamento] = useState(false);

  // Carrega ordens do Supabase
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("ordens_servico")
        .select("*, os_responsaveis(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAllOS(data || []);

      // Monta lista de meses/anos existentes nas OSs
      const periodSet = new Set();
      const now = new Date();
      const currentPeriodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      periodSet.add(currentPeriodKey);

      (data || []).forEach(os => {
        if (os.created_at) {
          const d = new Date(os.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          periodSet.add(key);
        }
      });

      const periodsSorted = Array.from(periodSet).sort((a, b) => b.localeCompare(a));
      setAvailablePeriods(periodsSorted);

    } catch (err) {
      console.error("Erro no Dashboard:", err);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  // Filtra as OSs pelo período selecionado
  const filteredData = useMemo(() => {
    if (selectedPeriod === 'all') {
      return allOS;
    }
    const [anoStr, mesStr] = selectedPeriod.split('-');
    const ano = Number(anoStr);
    const mes = Number(mesStr);

    return allOS.filter(os => {
      if (!os.created_at) return false;
      const d = new Date(os.created_at);
      return d.getFullYear() === ano && (d.getMonth() + 1) === mes;
    });
  }, [allOS, selectedPeriod]);

  // Estatísticas calculadas dinamicamente com parse rigoroso
  const { stats, pendingOS, pendingPayments, chartData } = useMemo(() => {
    let fat = 0;
    let custo = 0;
    let lucro = 0;
    const pendentesCA = [];
    const pendentesPag = [];

    // Determina mês e ano para o gráfico diário
    let chartYear, chartMonth;
    if (selectedPeriod === 'all') {
      const now = new Date();
      chartYear = now.getFullYear();
      chartMonth = now.getMonth();
    } else {
      const [anoStr, mesStr] = selectedPeriod.split('-');
      chartYear = Number(anoStr);
      chartMonth = Number(mesStr) - 1;
    }

    const daysInMonth = new Date(chartYear, chartMonth + 1, 0).getDate();
    const dailyProfit = Array.from({ length: daysInMonth }, (_, i) => ({
      dia: String(i + 1).padStart(2, '0'),
      lucro: 0
    }));

    filteredData.forEach(os => {
      const vFat = parseMonetary(os.valor_unitario_total);
      const vCusto = parseMonetary(os.curso_responsavel) + parseMonetary(os.valor_iss);
      const vLucro = parseMonetary(os.lucro_previsto);

      fat += vFat;
      custo += vCusto;
      lucro += vLucro;

      if (os.status_conta_azul !== 'Concluído') {
        pendentesCA.push(os);
      }

      if (os.os_responsaveis && os.os_responsaveis.length > 0) {
        os.os_responsaveis.forEach(r => {
          if (r.status_pagamento !== 'Pago' && r.status_pagamento !== 'Não se aplica') {
            const totFreel = parseMonetary(r.valor_freelance);
            const totCond = parseMonetary(r.reembolso_conducao);
            const totAlim = parseMonetary(r.reembolso_alimentacao);
            const totHosp = parseMonetary(r.reembolso_hospedagem);
            const totalPg = totFreel + totCond + totAlim + totHosp;

            pendentesPag.push({
              ...r,
              numero_os: os.numero_os,
              total: totalPg,
              nome_os: os.nome_os || os.endereco,
              cidade: os.cidade
            });
          }
        });
      }

      // Alimenta o gráfico diário
      if (os.created_at) {
        const osDate = new Date(os.created_at);
        if (osDate.getMonth() === chartMonth && osDate.getFullYear() === chartYear) {
          const day = osDate.getDate();
          if (day >= 1 && day <= daysInMonth) {
            dailyProfit[day - 1].lucro += vLucro;
          }
        }
      }
    });

    const margem = fat > 0 ? (lucro / fat) * 100 : 0;

    return {
      stats: {
        totalFaturado: fat,
        totalCustos: custo,
        lucroTotal: lucro,
        totalOS: filteredData.length,
        contaAzulPendentes: pendentesCA.length,
        pagamentosPendentes: pendentesPag.length,
        margemMedia: margem
      },
      pendingOS: pendentesCA,
      pendingPayments: pendentesPag,
      chartData: dailyProfit
    };
  }, [filteredData, selectedPeriod]);

  // Label amigável do período ativo
  const periodLabel = useMemo(() => {
    if (selectedPeriod === 'all') return 'Todos os Períodos (Acumulado)';
    const [anoStr, mesStr] = selectedPeriod.split('-');
    const mIdx = Number(mesStr) - 1;
    return `${MESES_NOMES[mIdx] || mesStr} de ${anoStr}`;
  }, [selectedPeriod]);

  // Reiniciar cards / Iniciar novo ciclo
  const handleReiniciarCards = async () => {
    const confirmed = await confirmDialog({
      title: 'Reiniciar Cards do Dashboard',
      message: 'Deseja reiniciar a visualização dos cards para o mês atual vigente? Os dados do mês anterior continuam salvos e acessíveis nos relatórios.',
      confirmText: 'Sim, reiniciar cards',
      cancelText: 'Cancelar'
    });

    if (!confirmed) return;

    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedPeriod(currentKey);
    setActiveDashboardPeriod({
      tipo: 'mes_atual',
      ano: now.getFullYear(),
      mes: now.getMonth() + 1,
      label: `${MESES_NOMES[now.getMonth()]} de ${now.getFullYear()}`
    });
    toast.success('Cards reiniciados para o mês atual!');
  };

  // Salvar Fechamento Mensal e Gerar Relatório
  const handleSalvarFechamento = async () => {
    if (selectedPeriod === 'all') {
      toast.warning('Selecione um mês específico para realizar o fechamento mensal.');
      return;
    }

    setIsSavingFechamento(true);
    try {
      const [anoStr, mesStr] = selectedPeriod.split('-');
      const ano = Number(anoStr);
      const mes = Number(mesStr);

      const { data: { user } } = await supabase.auth.getUser();

      const relatorioPayload = {
        titulo: `Fechamento ${MESES_NOMES[mes - 1]} / ${ano}`,
        mes,
        ano,
        periodo_inicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
        periodo_fim: `${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate()}`,
        total_faturado: stats.totalFaturado,
        total_custos: stats.totalCustos,
        lucro_total: stats.lucroTotal,
        margem_media: stats.margemMedia,
        total_os: stats.totalOS,
        conta_azul_pendentes: stats.contaAzulPendentes,
        pagamentos_pendentes: stats.pagamentosPendentes,
        observacoes: fechamentoNotas,
        fechado_por: user?.email || 'Administrador',
        dados_snapshot: {
          ordens: filteredData.map(o => ({
            numero_os: o.numero_os,
            nome_os: o.nome_os || o.endereco,
            cidade: o.cidade,
            valor: parseMonetary(o.valor_unitario_total),
            custo: parseMonetary(o.curso_responsavel) + parseMonetary(o.valor_iss),
            lucro: parseMonetary(o.lucro_previsto),
            conta_azul: o.status_conta_azul
          })),
          total_pendentes_pagamento: pendingPayments.length
        }
      };

      await salvarRelatorioMensal(relatorioPayload);
      toast.success(`Relatório de ${MESES_NOMES[mes - 1]}/${ano} arquivado com sucesso!`);
      setShowFechamentoModal(false);
      setFechamentoNotas('');

      // Se solicitado, reinicia cards para o mês seguinte ou mês atual
      if (reiniciarAposFechamento) {
        const nextDate = new Date(ano, mes, 1); // próximo mês
        const nextKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
        setSelectedPeriod(nextKey);
        setActiveDashboardPeriod({
          tipo: 'mes_atual',
          ano: nextDate.getFullYear(),
          mes: nextDate.getMonth() + 1,
          label: `${MESES_NOMES[nextDate.getMonth()]} de ${nextDate.getFullYear()}`
        });
        toast.info(`Cards reiniciados para o novo ciclo (${MESES_NOMES[nextDate.getMonth()]}/${nextDate.getFullYear()}).`);
      }
    } catch (err) {
      console.error('Erro ao salvar relatório mensal:', err);
      toast.error('Erro ao arquivar relatório mensal: ' + err.message);
    } finally {
      setIsSavingFechamento(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'white', padding: '10px 15px', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', color: '#374151' }}>Dia {label}</p>
          <p style={{ margin: 0, color: '#10b981', fontWeight: 'bold' }}>
            Lucro: {formatBRL(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) return <div style={{ padding: '30px', textAlign: 'center' }}>Carregando dashboard...</div>;

  return (
    <div className="dashboard-container">
      {/* HEADER DO DASHBOARD COM CONTROLE DE PERÍODO E AÇÕES */}
      <div className="dash-header">
        <div className="dash-header-title">
          <h2>Dashboard Financeiro</h2>
          <p className="text-muted">Visão consolidada de desempenho das Ordens de Serviço por período</p>
        </div>

        <div className="dash-actions-bar">
          {/* Seletor de Período Mensal */}
          <div className="period-selector-wrapper">
            <Calendar size={18} className="period-icon" />
            <select 
              value={selectedPeriod} 
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="period-select"
              title="Selecione o mês de apuração"
            >
              {availablePeriods.map(pKey => {
                const [ano, mes] = pKey.split('-');
                const label = `${MESES_NOMES[Number(mes) - 1]} / ${ano}`;
                const isCurrent = pKey === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                return (
                  <option key={pKey} value={pKey}>
                    {label} {isCurrent ? '(Mês Vigente)' : ''}
                  </option>
                );
              })}
              <option value="all">Histórico Completo (Todos os Períodos)</option>
            </select>
          </div>

          {/* Botão Fechar Mês / Gerar Relatório */}
          <button 
            type="button" 
            className="btn btn-primary btn-fechar-mes"
            onClick={() => setShowFechamentoModal(true)}
            title="Fechar os resultados do período atual e arquivar relatório"
          >
            <Archive size={16} />
            <span>Fechar Mês / Salvar Relatório</span>
          </button>

          {/* Botão Acessar Relatórios Arquivados */}
          <button 
            type="button" 
            className="btn btn-outline"
            onClick={() => navigate('/relatorios')}
            title="Acessar histórico de relatórios arquivados"
          >
            <FileSpreadsheet size={16} />
            <span>Acessar Relatórios</span>
          </button>

          {/* Botão Reiniciar Cards */}
          <button 
            type="button" 
            className="btn-icon-subtle"
            onClick={handleReiniciarCards}
            title="Reiniciar cards para o mês vigente"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* BANNER INFORMATIVO DO PERÍODO */}
      <div className="period-badge-banner">
        <span>Visualizando resultados de: <strong>{periodLabel}</strong></span>
        {filteredData.length === 0 && (
          <span className="period-empty-warning">
            <AlertCircle size={14} /> Nenhuma OS cadastrada neste período. Os cards estão zerados.
          </span>
        )}
      </div>

      {/* CARDS PRINCIPAIS COM FORMATAÇÃO MONETÁRIA BR EXATA */}
      <div className="grid-3 mb-20">
        <div className="stat-card">
          <div className="stat-icon bg-blue"><DollarSign size={24} color="#0084ff" /></div>
          <div className="stat-info">
            <span className="stat-label">Total Faturado</span>
            <span className="stat-value">{formatBRL(stats.totalFaturado)}</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon bg-orange"><Activity size={24} color="#f59e0b" /></div>
          <div className="stat-info">
            <span className="stat-label">Custos Totais (Equipe + Impostos)</span>
            <span className="stat-value">{formatBRL(stats.totalCustos)}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-green"><TrendingUp size={24} color="#10b981" /></div>
          <div className="stat-info">
            <span className="stat-label">Lucro Previsto Total</span>
            <span className="stat-value text-success">{formatBRL(stats.lucroTotal)}</span>
          </div>
        </div>
      </div>

      {/* CARDS SECUNDÁRIOS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <div className="stat-card minimal">
          <div className="stat-info">
            <span className="stat-label">Total de OS</span>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <FileText size={20} className="text-muted"/>
              <span className="stat-value">{stats.totalOS}</span>
            </div>
          </div>
        </div>

        <div className="stat-card minimal clickable-card" onClick={() => setShowPendingModal(true)}>
          <div className="stat-info">
            <span className="stat-label" style={{ display:'flex', justifyContent:'space-between' }}>
              OSs s/ Conta Azul <ArrowRight size={14} color="#f59e0b"/>
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <CheckCircle size={20} color={stats.contaAzulPendentes > 0 ? "#f59e0b" : "#10b981"}/>
              <span className="stat-value" style={{ color: stats.contaAzulPendentes > 0 ? "#f59e0b" : "#10b981" }}>
                {stats.contaAzulPendentes}
              </span>
            </div>
          </div>
        </div>
        
        <div className="stat-card minimal clickable-card" onClick={() => setShowPaymentsModal(true)}>
          <div className="stat-info">
            <span className="stat-label" style={{ display:'flex', justifyContent:'space-between' }}>
              Pagamentos Pendentes <ArrowRight size={14} color="#ef4444"/>
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <Users size={20} color={stats.pagamentosPendentes > 0 ? "#ef4444" : "#10b981"}/>
              <span className="stat-value" style={{ color: stats.pagamentosPendentes > 0 ? "#ef4444" : "#10b981" }}>
                {stats.pagamentosPendentes}
              </span>
            </div>
          </div>
        </div>

        <div className="stat-card minimal">
          <div className="stat-info">
            <span className="stat-label">Margem Média</span>
            <span className="stat-value">{stats.margemMedia.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* GRÁFICO DIÁRIO */}
      <div className="chart-container">
        <div className="chart-header">
          <h3>Lucro Diário - {periodLabel}</h3>
          <p>Evolução do lucro previsto calculado pelas OSs criadas em cada dia deste período.</p>
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#6b7280', fontSize: 12 }} 
                tickFormatter={(value) => formatBRL(value)} 
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
              <Bar dataKey="lucro" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MODAL: FECHAMENTO DE PERÍODO MENSAL & GERAR RELATÓRIO */}
      {showFechamentoModal && (
        <div className="modal-overlay" onClick={() => setShowFechamentoModal(false)}>
          <div className="modal-content modal-fechamento" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Fechar Período e Gerar Relatório</h3>
                <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: 13 }}>
                  Consolidar resultados de: <strong>{periodLabel}</strong>
                </p>
              </div>
              <button className="btn-close" onClick={() => setShowFechamentoModal(false)}><X size={20}/></button>
            </div>

            <div className="modal-body">
              {/* Resumo do Fechamento */}
              <div className="fechamento-summary-box">
                <div className="summary-item">
                  <span className="summary-lbl">Total Faturado</span>
                  <span className="summary-val text-primary">{formatBRL(stats.totalFaturado)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-lbl">Custos Totais</span>
                  <span className="summary-val text-orange">{formatBRL(stats.totalCustos)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-lbl">Lucro Previsto</span>
                  <span className="summary-val text-success">{formatBRL(stats.lucroTotal)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-lbl">Margem</span>
                  <span className="summary-val">{stats.margemMedia.toFixed(1)}%</span>
                </div>
                <div className="summary-item">
                  <span className="summary-lbl">Qtd. de OSs</span>
                  <span className="summary-val">{stats.totalOS}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-lbl">Pagamentos Pendentes</span>
                  <span className="summary-val text-danger">{stats.pagamentosPendentes}</span>
                </div>
              </div>

              {/* Observações */}
              <div className="form-group mb-15">
                <label className="fw-medium">Observações do Fechamento (opcional):</label>
                <textarea 
                  rows="3"
                  className="form-control"
                  placeholder="Ex: Fechamento mensal concluído. Metas batidas."
                  value={fechamentoNotas}
                  onChange={(e) => setFechamentoNotas(e.target.value)}
                />
              </div>

              {/* Opção para reiniciar cards */}
              <div className="checkbox-option-box">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={reiniciarAposFechamento}
                    onChange={(e) => setReiniciarAposFechamento(e.target.checked)}
                  />
                  <span>
                    <strong>Reiniciar os cards após salvar:</strong> avança a visão do dashboard para o próximo ciclo/mês com cards zerados.
                  </span>
                </label>
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '15px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => setShowFechamentoModal(false)}
                disabled={isSavingFechamento}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleSalvarFechamento}
                disabled={isSavingFechamento}
              >
                <Archive size={16} />
                {isSavingFechamento ? 'Arquivando...' : 'Confirmar Fechamento e Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Conta Azul */}
      {showPendingModal && (
        <div className="modal-overlay" onClick={() => setShowPendingModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>OSs Sem Conta Azul ({periodLabel})</h3>
              <button className="btn-close" onClick={() => setShowPendingModal(false)}><X size={20}/></button>
            </div>
            <div className="modal-body">
              {pendingOS.length > 0 ? (
                <div className="pending-list">
                  {pendingOS.map(os => (
                    <div 
                      key={os.numero_os} 
                      className="pending-item" 
                      onClick={() => navigate(`/os-form?id=${os.numero_os}&view=true`)} 
                      style={{ cursor: 'pointer' }}
                      title="Clique para visualizar OS"
                    >
                      <div>
                        <div className="os-number">{os.numero_os}</div>
                        <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '2px', fontWeight: 500 }}>
                          {os.nome_os || os.endereco || 'Sem nome'}
                          {os.cidade && <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '6px' }}>• {os.cidade}</span>}
                        </div>
                      </div>
                      <ExternalLink size={18} color="#9ca3af" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#6b7280' }}>
                  <CheckCircle size={40} color="#10b981" style={{ marginBottom: 10 }} opacity={0.5} />
                  <p>Nenhuma OS pendente no Conta Azul neste período!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL: Pagamentos Pendentes */}
      {showPaymentsModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentsModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pagamentos de Equipe Pendentes ({periodLabel})</h3>
              <button className="btn-close" onClick={() => setShowPaymentsModal(false)}><X size={20}/></button>
            </div>
            <div className="modal-body">
              {pendingPayments.length > 0 ? (
                <div className="pending-list">
                  {pendingPayments.map((p, idx) => (
                    <div 
                      key={idx} 
                      className="pending-item" 
                      onClick={() => navigate(`/os-form?id=${p.numero_os}&view=true`)} 
                      style={{ cursor: 'pointer', borderLeft: '4px solid #ef4444' }}
                      title="Clique para visualizar OS do pagamento"
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{p.nome}</span>
                          <span style={{ fontWeight: 600, color: '#ef4444' }}>{formatBRL(p.total)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="os-number" style={{ fontSize: '13px' }}>
                            {p.numero_os} {p.nome_os ? `• ${p.nome_os}` : ''}
                          </div>
                          {p.agendamento && <span style={{ fontSize: '12px', color: '#6b7280' }}>Agendado: {p.agendamento.split('-').reverse().join('/')}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#6b7280' }}>
                  <CheckCircle size={40} color="#10b981" style={{ marginBottom: 10 }} opacity={0.5} />
                  <p>Nenhum pagamento pendente neste período!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default Dashboard;
