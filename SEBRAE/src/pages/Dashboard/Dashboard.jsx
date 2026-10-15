import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useNavigate } from 'react-router-dom';
import { TrendingUp, DollarSign, Activity, FileText, CheckCircle, X, ExternalLink, ArrowRight, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import "./Dashboard.css";

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalFaturado: 0,
    totalCustos: 0,
    lucroTotal: 0,
    totalOS: 0,
    contaAzulPendentes: 0,
    pagamentosPendentes: 0,
    margemMedia: 0
  });
  
  const [pendingOS, setPendingOS] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);
  
  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const { data, error } = await supabase.from("ordens_servico").select("*, os_responsaveis(*)");
        if (error) throw error;
        
        let fat = 0, custo = 0, lucro = 0;
        const pendentesCA = [];
        const pendentesPag = [];
        
        // Setup Chart Array for current month
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        const dailyProfit = Array.from({length: daysInMonth}, (_, i) => ({
          dia: String(i + 1).padStart(2, '0'),
          lucro: 0
        }));
        
        if (data && data.length > 0) {
          data.forEach(os => {
            fat += Number(os.valor_unitario_total || 0);
            custo += Number(os.curso_responsavel || 0) + Number(os.valor_iss || 0);
            lucro += Number(os.lucro_previsto || 0);
            
            if (os.status_conta_azul !== 'Concluído') pendentesCA.push(os);

            if (os.os_responsaveis && os.os_responsaveis.length > 0) {
              os.os_responsaveis.forEach(r => {
                if (r.status_pagamento !== 'Pago' && r.status_pagamento !== 'Não se aplica') {
                  const totalPg = (Number(r.valor_freelance)||0) + (Number(r.reembolso_conducao)||0) + 
                                  (Number(r.reembolso_alimentacao)||0) + (Number(r.reembolso_hospedagem)||0);
                  pendentesPag.push({ ...r, numero_os: os.numero_os, total: totalPg, endereco: os.endereco });
                }
              });
            }

            // Populate Chart Data
            const osDate = new Date(os.created_at);
            if (osDate.getMonth() === currentMonth && osDate.getFullYear() === currentYear) {
               const day = osDate.getDate();
               dailyProfit[day - 1].lucro += Number(os.lucro_previsto || 0);
            }
          });
          
          setStats({
            totalFaturado: fat,
            totalCustos: custo,
            lucroTotal: lucro,
            totalOS: data.length,
            contaAzulPendentes: pendentesCA.length,
            pagamentosPendentes: pendentesPag.length,
            margemMedia: fat > 0 ? (lucro / fat) * 100 : 0
          });
          
          setPendingOS(pendentesCA);
          setPendingPayments(pendentesPag);
          
          const currentDay = new Date().getDate();
          setChartData(dailyProfit.slice(0, currentDay));
        }
      } catch (err) {
        console.error("Erro no Dashboard:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadDashboard();
  }, []);

  const formatMoney = (val) => `R$ ${val.toFixed(2).replace('.', ',')}`;
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{background: 'white', padding: '10px 15px', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}}>
          <p style={{margin: '0 0 5px 0', fontWeight: 'bold', color: '#374151'}}>Dia {label}</p>
          <p style={{margin: 0, color: '#10b981', fontWeight: 'bold'}}>
            Lucro: {formatMoney(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) return <div style={{padding: '30px'}}>Carregando dashboard...</div>;

  return (
    <div className="dashboard-container">
      <div className="dash-header">
        <h2>Dashboard Financeiro</h2>
        <p className="text-muted">Visão geral do desempenho das Ordens de Serviço</p>
      </div>

      <div className="grid-3 mb-20">
        <div className="stat-card">
          <div className="stat-icon bg-blue"><DollarSign size={24} color="#0084ff" /></div>
          <div className="stat-info">
            <span className="stat-label">Total Faturado</span>
            <span className="stat-value">{formatMoney(stats.totalFaturado)}</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon bg-orange"><Activity size={24} color="#f59e0b" /></div>
          <div className="stat-info">
            <span className="stat-label">Custos Totais (Equipe + Impostos)</span>
            <span className="stat-value">{formatMoney(stats.totalCustos)}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-green"><TrendingUp size={24} color="#10b981" /></div>
          <div className="stat-info">
            <span className="stat-label">Lucro Previsto Total</span>
            <span className="stat-value text-success">{formatMoney(stats.lucroTotal)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <div className="stat-card minimal">
          <div className="stat-info">
            <span className="stat-label">Total de OS</span>
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
              <FileText size={20} className="text-muted"/>
              <span className="stat-value">{stats.totalOS}</span>
            </div>
          </div>
        </div>

        <div className="stat-card minimal clickable-card" onClick={() => setShowPendingModal(true)}>
          <div className="stat-info">
            <span className="stat-label" style={{display:'flex', justifyContent:'space-between'}}>
              OSs s/ Conta Azul <ArrowRight size={14} color="#f59e0b"/>
            </span>
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
              <CheckCircle size={20} color={stats.contaAzulPendentes > 0 ? "#f59e0b" : "#10b981"}/>
              <span className="stat-value" style={{color: stats.contaAzulPendentes > 0 ? "#f59e0b" : "#10b981"}}>
                {stats.contaAzulPendentes}
              </span>
            </div>
          </div>
        </div>
        
        <div className="stat-card minimal clickable-card" onClick={() => setShowPaymentsModal(true)}>
          <div className="stat-info">
            <span className="stat-label" style={{display:'flex', justifyContent:'space-between'}}>
              Pagamentos Pendentes <ArrowRight size={14} color="#ef4444"/>
            </span>
            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
              <Users size={20} color={stats.pagamentosPendentes > 0 ? "#ef4444" : "#10b981"}/>
              <span className="stat-value" style={{color: stats.pagamentosPendentes > 0 ? "#ef4444" : "#10b981"}}>
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

      <div className="chart-container">
        <div className="chart-header">
          <h3>Lucro Diário - Mês Atual</h3>
          <p>Evolução do lucro previsto baseado na data de criação das OSs neste mês.</p>
        </div>
        <div style={{width: '100%', height: 300}}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{top: 10, right: 10, left: 0, bottom: 0}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} tickFormatter={(value) => `R$ ${value}`} />
              <Tooltip content={<CustomTooltip />} cursor={{fill: '#f3f4f6'}} />
              <Bar dataKey="lucro" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MODAL: Conta Azul */}
      {showPendingModal && (
        <div className="modal-overlay" onClick={() => setShowPendingModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>OSs Sem Conta Azul</h3>
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
                      style={{cursor: 'pointer'}}
                      title="Clique para visualizar OS"
                    >
                      <div>
                        <div className="os-number">{os.numero_os}</div>
                        <div style={{fontSize: '13px', color: '#6b7280', marginTop: '2px'}}>{os.endereco || 'Sem endereço'}</div>
                      </div>
                      <ExternalLink size={18} color="#9ca3af" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{textAlign: 'center', padding: '30px 0', color: '#6b7280'}}>
                  <CheckCircle size={40} color="#10b981" style={{marginBottom: 10}} opacity={0.5} />
                  <p>Nenhuma OS pendente no Conta Azul!</p>
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
              <h3>Pagamentos de Equipe Pendentes</h3>
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
                      style={{cursor: 'pointer', borderLeft: '4px solid #ef4444'}}
                      title="Clique para visualizar OS do pagamento"
                    >
                      <div style={{width: '100%'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '4px'}}>
                          <span style={{fontWeight: 600, color: '#1e293b'}}>{p.nome}</span>
                          <span style={{fontWeight: 600, color: '#ef4444'}}>{formatMoney(p.total)}</span>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div className="os-number" style={{fontSize: '13px'}}>{p.numero_os}</div>
                          {p.agendamento && <span style={{fontSize: '12px', color: '#6b7280'}}>Agendado: {p.agendamento.split('-').reverse().join('/')}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{textAlign: 'center', padding: '30px 0', color: '#6b7280'}}>
                  <CheckCircle size={40} color="#10b981" style={{marginBottom: 10}} opacity={0.5} />
                  <p>Nenhum pagamento pendente!</p>
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
