import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import './ListaResponsaveis.css';

const ListaResponsaveis = () => {
  const [responsaveis, setResponsaveis] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchResponsaveis = async () => {
      try {
        // Busca todos os responsáveis e ordena pelos agendamentos mais antigos primeiro
        const { data, error } = await supabase
          .from('os_responsaveis')
          .select('*')
          .order('agendamento', { ascending: true });

        if (error) throw error;
        setResponsaveis(data || []);
      } catch (error) {
        console.error("Erro ao buscar responsáveis:", error);
        alert("Erro ao carregar os dados.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchResponsaveis();
  }, []);

  // Pega a data de hoje no formato YYYY-MM-DD para comparar com o agendamento
  const dataHoje = new Date().toISOString().split('T')[0];

  // Filtra por nome do responsável caso o usuário digite algo na busca local
  const filteredList = responsaveis.filter(resp => 
    resp.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="lista-resp-container">
      <div className="lista-resp-header">
        <h2>Controle de Pagamentos (Responsáveis)</h2>
        <div className="header-actions">
          <input 
            type="text" 
            placeholder="Buscar por nome..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="table-wrapper">
        {isLoading ? (
          <p className="loading-text">Carregando pagamentos...</p>
        ) : (
          <table className="resp-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>OS Vinculada</th>
                <th>Agendamento</th>
                <th>Valor Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">Nenhum responsável encontrado.</td>
                </tr>
              ) : (
                filteredList.map((resp) => {
                  // Calcula o valor total a ser pago somando todos os custos daquele responsável
                  const valorTotal = (Number(resp.valor_freelance) || 0) + 
                                     (Number(resp.reembolso_conducao) || 0) + 
                                     (Number(resp.reembolso_alimentacao) || 0) + 
                                     (Number(resp.reembolso_hospedagem) || 0);
                  
                  // Lógica para verificar se está em atraso
                  const isAtrasado = resp.status_pagamento === 'Pendente' && resp.agendamento && resp.agendamento < dataHoje;
                  
                  // Define a classe CSS baseada no status
                  let statusClass = resp.status_pagamento === 'Pago' ? 'pago' : 'pendente';
                  if (isAtrasado) statusClass = 'atrasado';

                  // Define o texto a ser exibido
                  const statusTexto = isAtrasado ? 'Atrasado' : (resp.status_pagamento || 'Sem Status');

                  return (
                    <tr key={resp.id} className={isAtrasado ? 'linha-atrasada' : ''}>
                      <td className="fw-bold">{resp.nome}</td>
                      <td>{resp.numero_os}</td>
                      <td>{resp.agendamento || 'Não definido'}</td>
                      <td className="fw-bold">R$ {valorTotal.toFixed(2).replace('.', ',')}</td>
                      <td>
                        <span className={`status-badge ${statusClass}`}>
                          {statusTexto}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ListaResponsaveis;