import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../supabase';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  
  const [totalOS, setTotalOS] = useState(0);
  const [osPendentes, setOsPendentes] = useState([]);
  const [osSemNfse, setOsSemNfse] = useState([]);
  
  // Novos estados para os gráficos
  const [chartData, setChartData] = useState([]);
  const [pendingResponsibles, setPendingResponsibles] = useState([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalList, setModalList] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Requisição expandida para trazer lucro, data de criação e valores financeiros dos responsáveis
        const { data, error } = await supabase
          .from('ordens_servico')
          .select(`
            numero_os, 
            nfs_e, 
            lucro_previsto, 
            created_at, 
            os_responsaveis(nome, status_pagamento, valor_freelance, reembolso_conducao, reembolso_alimentacao, reembolso_hospedagem)
          `);

        if (error) throw error;

        if (data) {
          setTotalOS(data.length);

          // 1. Filtros para os Cards Superiores
          const pendentes = data.filter(os => 
            os.os_responsaveis && os.os_responsaveis.some(resp => resp.status_pagamento === 'Pendente')
          );
          setOsPendentes(pendentes);

          const semNfse = data.filter(os => !os.nfs_e || os.nfs_e.trim() === '');
          setOsSemNfse(semNfse);

          // 2. Processamento do Gráfico de Linha (Últimas 7 OS por Lucro Previsto)
          const sortedData = [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          const lastOS = sortedData.slice(-7); // Pega as últimas 7
          
          const mappedChartData = lastOS.map(os => ({
            name: os.numero_os,
            Lucro: Number(os.lucro_previsto || 0)
          }));
          setChartData(mappedChartData);

          // 3. Processamento do Gráfico Lateral (Soma de Pagamentos Pendentes por Responsável)
          const pendingTotals = {};
          
          data.forEach(os => {
            if (os.os_responsaveis) {
              os.os_responsaveis.forEach(resp => {
                if (resp.status_pagamento === 'Pendente') {
                  // Precisão absoluta na soma das despesas pendentes
                  const totalVal = (Number(resp.valor_freelance) || 0) +
                                   (Number(resp.reembolso_conducao) || 0) +
                                   (Number(resp.reembolso_alimentacao) || 0) +
                                   (Number(resp.reembolso_hospedagem) || 0);
                  
                  if (pendingTotals[resp.nome]) {
                    pendingTotals[resp.nome] += totalVal;
                  } else {
                    pendingTotals[resp.nome] = totalVal;
                  }
                }
              });
            }
          });

          // Transforma o dicionário em array, ordena do maior para o menor e pega os top 6 para caber no layout
          const pendingArray = Object.keys(pendingTotals)
            .map(nome => ({ nome, total: pendingTotals[nome] }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
            
          setPendingResponsibles(pendingArray);
        }
      } catch (error) {
        console.error("Erro ao buscar dados do dashboard:", error);
      }
    };

    fetchDashboardData();
  }, []);

  const handleOpenModal = (title, list) => {
    setModalTitle(title);
    setModalList(list);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => setIsModalOpen(false);
  const handleNavigateToOS = (numero_os) => navigate(`/os-form?id=${numero_os}`);

  // Encontra o valor máximo para calcular a porcentagem da barra horizontal
  const maxPendingAmount = pendingResponsibles.length > 0 
    ? Math.max(...pendingResponsibles.map(p => p.total)) 
    : 1;

  return (
    <div className="dashboard-container">
      <div className="metrics-grid">
        <div className="metric-card">
          <p>Total OS</p>
          <h3>{totalOS}</h3>
        </div>
        
        <div className="metric-card clickable" onClick={() => handleOpenModal('OS Pendentes (Pagamento)', osPendentes)}>
          <p>Pendentes</p>
          <h3>{osPendentes.length}</h3>
        </div>
        
        <div className="metric-card">
          <p>Concluídas</p>
          <h3>{totalOS - osPendentes.length}</h3>
        </div>
        
        <div className="metric-card clickable" onClick={() => handleOpenModal('OS Sem NFS-e', osSemNfse)}>
          <p>Sem NFS-e</p>
          <h3>{osSemNfse.length}</h3>
        </div>
      </div>

      <div className="dashboard-body">
        
        <div className="chart-area">
          <div className="chart-header">
            <span className="active">Lucro Previsto</span>
            <span>Últimas 7 OS cadastradas</span>
            <span className="legend" style={{marginLeft: 'auto'}}><span style={{color: '#0084ff'}}>•</span> Evolução de Lucro</span>
          </div>
          
          <div style={{ width: '100%', height: '300px', marginTop: '30px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} tickFormatter={(value) => `R$ ${value}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} 
                  formatter={(value) => `R$ ${Number(value).toFixed(2).replace('.', ',')}`}
                  labelStyle={{ fontWeight: 'bold', color: '#333', marginBottom: '5px' }}
                />
                <Line type="monotone" dataKey="Lucro" stroke="#0084ff" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="traffic-area">
          <h4>Pagamentos Pendentes</h4>
          
          {pendingResponsibles.length === 0 ? (
            <p style={{fontSize: '12px', color: '#888', marginTop: '20px'}}>Nenhum pagamento pendente no momento.</p>
          ) : (
            pendingResponsibles.map((resp, idx) => {
              const percentage = (resp.total / maxPendingAmount) * 100;
              
              return (
                <div className="traffic-item" key={idx}>
                  <span title={resp.nome} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                    {resp.nome}
                  </span> 
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '10px', color: '#888', fontWeight: 'bold' }}>
                      R$ {resp.total.toFixed(2).replace('.', ',')}
                    </span>
                    <div style={{ width: '80px', height: '5px', background: '#eee', borderRadius: '3px', overflow: 'hidden' }}>
                      {/* A largura da barra azul muda dinamicamente de acordo com a porcentagem calculada */}
                      <div style={{ width: `${percentage}%`, height: '100%', background: '#0084ff' }}></div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalTitle} ({modalList.length})</h3>
              <button className="close-btn" onClick={handleCloseModal}>✕</button>
            </div>
            <div className="modal-body">
              {modalList.length === 0 ? (
                <p className="empty-modal">Nenhuma ordem de serviço nesta categoria.</p>
              ) : (
                <ul className="modal-os-list">
                  {modalList.map(os => (
                    <li key={os.numero_os} onClick={() => handleNavigateToOS(os.numero_os)}>
                      <span>{os.numero_os}</span>
                      <span className="arrow-link">Ver detalhes →</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;