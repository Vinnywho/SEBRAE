import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabase';
import { useNavigate } from 'react-router-dom';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { isRecentlyEdited } from '../../utils/format';
import { Edit2, Trash2, Search, Plus, Clock, FileText, Download, CheckSquare, Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import './ListaOS.css';

const ListaOS = () => {
  const navigate = useNavigate();
  const { toast, confirmDialog } = useToast();
  const [listaOS, setListaOS] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [filtroSemNfs, setFiltroSemNfs] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrderOS, setSortOrderOS] = useState('none'); // 'none' | 'asc' | 'desc'
  
  // Bulk Actions
  const [selectedOSs, setSelectedOSs] = useState([]);
  const [bulkNfsE, setBulkNfsE] = useState('');

  const { diasEdicaoRecente } = useConfig();

  useEffect(() => {
    fetchOS();
  }, []);

  const fetchOS = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('ordens_servico')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) console.error("Erro ao buscar OS:", error);
    else setListaOS(data || []);
    setIsLoading(false);
  };

  const deletarOS = async (numero_os) => {
    const confirmed = await confirmDialog({
      title: 'Excluir Ordem de Serviço',
      message: `Tem certeza que deseja deletar a OS ${numero_os}? Essa ação removerá todos os detalhes e custos associados permanentemente.`,
      confirmText: 'Sim, excluir',
      cancelText: 'Cancelar',
      isDanger: true
    });

    if (!confirmed) return;

    try {
      const { error: rpcError } = await supabase.rpc('excluir_os', { p_numero_os: numero_os });
      if (rpcError) {
        const { error } = await supabase
          .from('ordens_servico')
          .delete()
          .eq('numero_os', numero_os);
        if (error) throw error;
      }
      setListaOS(listaOS.filter(os => os.numero_os !== numero_os));
      setSelectedOSs(prev => prev.filter(id => id !== numero_os));
      toast.success(`OS ${numero_os} excluída com sucesso!`);
    } catch (err) {
      toast.error("Erro ao deletar OS: " + err.message);
    }
  };

  // Filtros aplicados em memória
  const filteredOS = listaOS.filter(os => {
    const nomeOS = os.nome_os || os.endereco || '';
    const cidade = os.cidade || '';
    const matchesSearch = os.numero_os.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          nomeOS.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          cidade.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesDate = true;
    if (dataInicio) {
      matchesDate = matchesDate && new Date(os.created_at) >= new Date(dataInicio);
    }
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && new Date(os.created_at) <= fim;
    }

    let matchesNfs = true;
    if (filtroSemNfs) {
      matchesNfs = !os.nfs_e || os.nfs_e.trim() === '';
    }
    
    return matchesSearch && matchesDate && matchesNfs;
  });

  const toggleSortOS = () => {
    setSortOrderOS(prev => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  const sortedAndFilteredOS = useMemo(() => {
    if (sortOrderOS === 'none') return filteredOS;
    return [...filteredOS].sort((a, b) => {
      const numA = (a.numero_os || '').toString();
      const numB = (b.numero_os || '').toString();
      const cmp = numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
      return sortOrderOS === 'asc' ? cmp : -cmp;
    });
  }, [filteredOS, sortOrderOS]);

  // Bulk Actions Handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedOSs(sortedAndFilteredOS.map(o => o.numero_os));
    else setSelectedOSs([]);
  };

  const handleSelect = (numero_os, checked) => {
    if (checked) setSelectedOSs(prev => [...prev, numero_os]);
    else setSelectedOSs(prev => prev.filter(id => id !== numero_os));
  };

  const aplicarNfsE = async () => {
    const nfsTrimmed = bulkNfsE.trim();
    if (!nfsTrimmed) return toast.warning('Digite o número da NFS-e que deseja aplicar.');
    try {
      // 1. Tentar executar via RPC para gravar logs de auditoria completos
      const { error: rpcError } = await supabase.rpc('atualizar_nfs_e_em_massa', {
        p_numeros_os: selectedOSs,
        p_nfs_e: nfsTrimmed
      });

      // 2. Fallback caso a RPC ainda não tenha sido executada no banco
      if (rpcError) {
        console.warn('RPC atualizar_nfs_e_em_massa não encontrada ou falhou, usando fallback direto:', rpcError);
        const { error: fallbackError } = await supabase
          .from('ordens_servico')
          .update({ nfs_e: nfsTrimmed })
          .in('numero_os', selectedOSs);
          
        if (fallbackError) throw fallbackError;
      }
      
      toast.success('NFS-e atribuída com sucesso para as OSs selecionadas!');
      setBulkNfsE('');
      setSelectedOSs([]);
      fetchOS(); // Recarrega para ver as mudanças
    } catch (err) {
      toast.error('Erro ao atribuir NFS-e: ' + err.message);
    }
  };

  const exportToCSV = async () => {
    if (sortedAndFilteredOS.length === 0) return toast.warning('Não há dados para exportar com os filtros atuais.');
    
    setIsLoading(true);
    try {
      // Divide em lotes de 100 para não estourar o limite de URL da API do Supabase
      const osNumbers = sortedAndFilteredOS.map(o => o.numero_os);
      const detalhesPorOs = {};
      const responsaveisPorOs = {};

      const chunkSize = 100;
      for (let i = 0; i < osNumbers.length; i += chunkSize) {
        const chunk = osNumbers.slice(i, i + chunkSize);
        
        const { data: detData } = await supabase.from('os_detalhes').select('*').in('numero_os', chunk);
        if (detData) {
          detData.forEach(d => {
            if (!detalhesPorOs[d.numero_os]) detalhesPorOs[d.numero_os] = [];
            detalhesPorOs[d.numero_os].push(d);
          });
        }

        const { data: respData } = await supabase.from('os_responsaveis').select('*').in('numero_os', chunk);
        if (respData) {
          respData.forEach(r => {
            if (!responsaveisPorOs[r.numero_os]) responsaveisPorOs[r.numero_os] = [];
            responsaveisPorOs[r.numero_os].push(r);
          });
        }
      }

      const headers = [
        'Número da OS', 'Lote', 'Nome da OS', 'Cidade', 'Adicionais', 'Observações',
        'Valor unitário total', 'Custo responsável', 'NFS-e', 'Valor ISS', 'Lucro previsto',
        'Detalhe - Nome do Responsável', 'Detalhe - Serviço / Endereço', 'Detalhe - Data',
        'Detalhe - Horário Gravação', 'Detalhe - Horário Saída', 'Detalhe - Data de Pagamento', 'Detalhe - Valor Unitário'
      ];

      const csvRows = [];

      filteredOS.forEach(os => {
        const detalhes = detalhesPorOs[os.numero_os] || [];
        const responsaveis = responsaveisPorOs[os.numero_os] || [];
        const nomeOS = os.nome_os || os.endereco || '';
        const cidade = os.cidade || '';

        if (detalhes.length === 0) {
          csvRows.push([
            os.numero_os, os.lote, nomeOS, cidade, os.adicionais, os.observacoes,
            os.valor_unitario_total, os.curso_responsavel, os.nfs_e, os.valor_iss, os.lucro_previsto,
            '', '', '', '', '', '', ''
          ]);
        } else {
          detalhes.forEach(det => {
            const resp = responsaveis.find(r => r.nome === det.responsavel_servico) || {};
            csvRows.push([
              os.numero_os, os.lote, nomeOS, cidade, os.adicionais, os.observacoes,
              os.valor_unitario_total, os.curso_responsavel, os.nfs_e, os.valor_iss, os.lucro_previsto,
              det.responsavel_servico, det.servico,
              det.data_servico ? det.data_servico.split('-').reverse().join('/') : '',
              det.horario_gravacao, det.horario_saida,
              resp.data_pagamento ? resp.data_pagamento.split('-').reverse().join('/') : '',
              det.valor_unitario
            ]);
          });
        }
      });

      const formatCell = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""').replace(/\n/g, ' '); // remove quebras de linha para n quebrar o CSV
        return `"${str}"`;
      };

      const csvData = csvRows.map(row => row.map(formatCell).join(';'));
      const csvContent = '\uFEFF' + headers.join(';') + '\n' + csvData.join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Exportacao_OS_Detalhada_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("CSV detalhado exportado com sucesso!");
    } catch (err) {
      toast.error("Erro ao exportar: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="lista-os-container">
      <div className="lista-header">
        <div>
          <h2>Ordens de Serviço</h2>
          <p className="text-muted">Gerencie todas as OS cadastradas no sistema (clique na linha para visualizar)</p>
        </div>
        <div style={{display: 'flex', gap: '10px'}}>
          <button className="btn-outline" onClick={exportToCSV}>
            <Download size={18} /> Exportar CSV
          </button>
          <button className="btn-primary" onClick={() => navigate('/os-form')}>
            <Plus size={18} /> Nova OS
          </button>
        </div>
      </div>

      {selectedOSs.length > 0 && (
        <div className="bulk-actions-bar">
          <CheckSquare size={20} color="#1e3a8a" />
          <span>{selectedOSs.length} {selectedOSs.length === 1 ? 'OS selecionada' : 'OS selecionadas'}</span>
          <div style={{width: 1, height: 24, background: '#bfdbfe', margin: '0 10px'}}></div>
          <input 
            type="text" 
            placeholder="Nº da Nota Fiscal (NFS-e)" 
            value={bulkNfsE}
            onChange={(e) => setBulkNfsE(e.target.value)}
          />
          <button className="btn-primary" onClick={aplicarNfsE}>Atribuir NFS-e</button>
          <button className="btn-outline" style={{marginLeft: 'auto'}} onClick={() => setSelectedOSs([])}>Cancelar seleção</button>
        </div>
      )}

      <div className="card list-card">
        <div className="list-filters">
          <div className="filters-row">
            <div className="search-wrapper">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Buscar por número ou nome..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="date-filters">
              <div className="date-filter-group">
                <label>De:</label>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div className="date-filter-group">
                <label>Até:</label>
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <button 
                className={`btn-outline ${filtroSemNfs ? 'active' : ''}`} 
                onClick={() => setFiltroSemNfs(!filtroSemNfs)}
                style={{
                  marginLeft: '10px', 
                  backgroundColor: filtroSemNfs ? '#ebf8f2' : 'transparent', 
                  borderColor: filtroSemNfs ? '#10b981' : '#e5e7eb',
                  color: filtroSemNfs ? '#047857' : '#4b5563',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Filter size={16} />
                {filtroSemNfs ? 'Apenas Sem NFS-e' : 'Filtrar Sem NFS-e'}
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div style={{padding: '30px', textAlign: 'center'}}>Carregando...</div>
        ) : (
          <div className="table-responsive">
            <table className="table data-table table-hover">
              <thead>
                <tr>
                  <th style={{width: '40px', textAlign: 'center'}}>
                    <input 
                      type="checkbox" 
                      checked={sortedAndFilteredOS.length > 0 && selectedOSs.length === sortedAndFilteredOS.length} 
                      onChange={handleSelectAll} 
                    />
                  </th>
                  <th 
                    onClick={toggleSortOS} 
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    title="Clique para ordenar por Nº OS (crescente/decrescente)"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Nº OS</span>
                      {sortOrderOS === 'asc' && <ArrowUp size={14} color="#047857" />}
                      {sortOrderOS === 'desc' && <ArrowDown size={14} color="#047857" />}
                      {sortOrderOS === 'none' && <ArrowUpDown size={14} color="#9ca3af" />}
                    </div>
                  </th>
                  <th>Criação</th>
                  <th>Lote</th>
                  <th>Nome da OS</th>
                  <th>Cidade</th>
                  <th>Faturamento</th>
                  <th>NFS-e</th>
                  <th>Conta Azul</th>
                  <th style={{textAlign: 'right'}}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredOS.length > 0 ? sortedAndFilteredOS.map((os) => {
                  const recent = isRecentlyEdited(os.updated_at, diasEdicaoRecente);
                  return (
                    <tr 
                      key={os.numero_os} 
                      onClick={(e) => {
                        if (e.target.closest('.action-btn') || e.target.closest('.row-checkbox')) return;
                        navigate(`/os-form?id=${os.numero_os}&view=true`);
                      }}
                      style={{cursor: 'pointer'}}
                      title="Clique para visualizar detalhes"
                      className={selectedOSs.includes(os.numero_os) ? 'selected-row' : ''}
                    >
                      <td className="row-checkbox" style={{textAlign: 'center'}} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedOSs.includes(os.numero_os)} 
                          onChange={(e) => handleSelect(os.numero_os, e.target.checked)} 
                        />
                      </td>
                      <td className="fw-bold">
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <FileText size={16} className="text-muted" />
                          {os.numero_os}
                          {recent && <span className="recent-indicator" title={`Editada nos últimos ${diasEdicaoRecente} dias`}><Clock size={14} /></span>}
                        </div>
                      </td>
                      <td>{new Date(os.created_at).toLocaleDateString('pt-BR')}</td>
                      <td>{os.lote || '-'}</td>
                      <td className="fw-medium">{os.nome_os || os.endereco || '-'}</td>
                      <td>{os.cidade || '-'}</td>
                      <td>R$ {Number(os.valor_unitario_total || 0).toFixed(2).replace('.', ',')}</td>
                      <td>
                        {os.nfs_e ? (
                          <span>{os.nfs_e}</span>
                        ) : (
                          <span className="badge danger" style={{opacity: 0.8}}>S/ Nota</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${os.status_conta_azul === 'Concluído' ? 'success' : 'warning'}`}>
                          {os.status_conta_azul || 'Pendente'}
                        </span>
                      </td>
                      <td style={{textAlign: 'right'}}>
                        <button className="action-btn" onClick={(e) => { e.stopPropagation(); navigate(`/os-form?id=${os.numero_os}`); }} title="Editar OS"><Edit2 size={16} /></button>
                        <button className="action-btn danger" onClick={(e) => { e.stopPropagation(); deletarOS(os.numero_os); }} title="Deletar OS"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan="10" style={{textAlign: 'center', padding: '30px'}}>Nenhuma OS encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default ListaOS;
