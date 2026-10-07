import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useNavigate } from 'react-router-dom';
import { Search, User, FileText, CheckCircle, Clock } from 'lucide-react';
import './ListaResponsaveis.css';

const ListaResponsaveis = () => {
  const navigate = useNavigate();
  const [responsaveis, setResponsaveis] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
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

  const filtered = responsaveis.filter(r => 
    r.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.numero_os.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="lista-resp-container">
      <div className="lista-header">
        <div>
          <h2>Pagamentos da Equipe</h2>
          <p className="text-muted">Acompanhe os valores a pagar para os responsáveis por OS (clique para visualizar a OS)</p>
        </div>
      </div>

      <div className="card list-card">
        <div className="list-filters">
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou número da OS..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div style={{padding: '30px', textAlign: 'center'}}>Carregando...</div>
        ) : (
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
                {filtered.length > 0 ? filtered.map((r, i) => {
                  const total = (Number(r.valor_freelance)||0) + (Number(r.reembolso_conducao)||0) + 
                                (Number(r.reembolso_alimentacao)||0) + (Number(r.reembolso_hospedagem)||0);
                  return (
                    <tr key={i} onClick={() => navigate(`/os-form?id=${r.numero_os}&view=true`)} style={{cursor: 'pointer'}} title="Clique para visualizar a OS">
                      <td className="fw-bold">
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <User size={16} className="text-muted" /> {r.nome}
                        </div>
                      </td>
                      <td>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <FileText size={16} className="text-muted" /> {r.numero_os}
                        </div>
                      </td>
                      <td>R$ {total.toFixed(2).replace('.',',')}</td>
                      <td>{r.agendamento ? r.agendamento.split('-').reverse().join('/') : '-'}</td>
                      <td>
                        <span className={`badge ${r.status_pagamento === 'Pago' ? 'success' : 'warning'}`}>
                          {r.status_pagamento === 'Pago' ? <CheckCircle size={12} style={{marginRight:4}}/> : <Clock size={12} style={{marginRight:4}}/>}
                          {r.status_pagamento || 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan="5" style={{textAlign: 'center', padding: '30px'}}>Nenhum pagamento encontrado.</td></tr>
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
