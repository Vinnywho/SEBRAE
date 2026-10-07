import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useConfig } from '../../context/ConfigContext';
import { formatDateTime } from '../../utils/format';
import { Settings, RefreshCw, Archive, User, FileText, Edit2, Plus, X, Save, Trash2 } from 'lucide-react';
import './Configuracoes.css';

const Configuracoes = () => {
  const { lotes, aliquotaISS, diasEdicaoRecente, reloadConfig } = useConfig();
  const [activeTab, setActiveTab] = useState('lotes');

  // Lotes State
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [editingLoteCodigo, setEditingLoteCodigo] = useState(null);
  const [loteEditData, setLoteEditData] = useState({ nome: '', ativo: true, produtos: [] });

  // Logs State
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    setLogs(data || []);
    setLoadingLogs(false);
  };

  const openNewLote = () => {
    setEditingLoteCodigo(null);
    setLoteEditData({ 
      nome: '', 
      ativo: true, 
      produtos: [
        { id: Date.now().toString(), nome: 'Captação de vídeo', unidade: 'meia diária', valor: 0 },
        { id: (Date.now()+1).toString(), nome: 'Edição de vídeo', unidade: 'meia diária', valor: 0 },
        { id: (Date.now()+2).toString(), nome: 'Captação de vídeo', unidade: 'Hora adicional', valor: 0 },
        { id: (Date.now()+3).toString(), nome: 'Edição de vídeo', unidade: 'Hora adicional', valor: 0 }
      ] 
    });
    setShowLoteModal(true);
  };

  const openEditLote = (codigo, lote) => {
    setEditingLoteCodigo(codigo);
    // Backward compatibility: If it doesn't have produtos, auto-migrate it for the edit view
    let prods = lote.produtos || [];
    if (prods.length === 0 && lote.diaria) {
       prods = [
         { id: Date.now().toString(), nome: 'Captação de vídeo', unidade: 'meia diária', valor: lote.diaria },
         { id: (Date.now()+1).toString(), nome: 'Edição de vídeo', unidade: 'meia diária', valor: lote.diaria }
       ];
    }
    setLoteEditData({ nome: lote.nome, ativo: lote.ativo, produtos: prods });
    setShowLoteModal(true);
  };

  const addProduto = () => {
    setLoteEditData(prev => ({
      ...prev,
      produtos: [...prev.produtos, { id: Date.now().toString(), nome: '', unidade: '', valor: 0 }]
    }));
  };

  const removeProduto = (idx) => {
    setLoteEditData(prev => ({
      ...prev,
      produtos: prev.produtos.filter((_, i) => i !== idx)
    }));
  };

  const updateProduto = (idx, field, value) => {
    setLoteEditData(prev => {
      const arr = [...prev.produtos];
      arr[idx] = { ...arr[idx], [field]: field === 'valor' ? Number(value) : value };
      return { ...prev, produtos: arr };
    });
  };

  const handleSaveLote = async () => {
    if (!loteEditData.nome.trim()) return alert("O nome do lote é obrigatório.");
    
    try {
      const isNew = !editingLoteCodigo;
      let codigo = editingLoteCodigo;
      
      if (isNew) {
        codigo = `lote_${Date.now()}`;
      }

      const payload = {
        codigo,
        nome: loteEditData.nome,
        ativo: loteEditData.ativo,
        produtos: loteEditData.produtos
      };

      if (isNew) {
         const maxOrdem = Object.values(lotes).length + 1;
         payload.ordem = maxOrdem;
         const { error } = await supabase.from('lotes').insert([payload]);
         if (error) throw error;
      } else {
         const { error } = await supabase.from('lotes').update(payload).eq('codigo', codigo);
         if (error) throw error;
      }
      
      alert('Lote salvo com sucesso!');
      setShowLoteModal(false);
      setEditingLoteCodigo(null);
      reloadConfig();
    } catch (err) {
      alert('Erro ao salvar lote: ' + err.message);
    }
  };

  return (
    <div className="config-container">
      <div className="config-header">
        <h2>Configurações do Sistema</h2>
        <button className="btn-outline" onClick={reloadConfig}>
          <RefreshCw size={16} /> Recarregar dados
        </button>
      </div>

      <div className="config-tabs" style={{overflowX: 'auto', display: 'flex', whiteSpace: 'nowrap', paddingBottom: '5px'}}>
        <button className={activeTab === 'lotes' ? 'active' : ''} onClick={() => setActiveTab('lotes')}>
          <Archive size={16} /> Lotes e Produtos
        </button>
        <button className={activeTab === 'parametros' ? 'active' : ''} onClick={() => setActiveTab('parametros')}>
          <Settings size={16} /> Parâmetros globais
        </button>
        <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>
          <FileText size={16} /> Logs de Auditoria
        </button>
        <button className={activeTab === 'conta' ? 'active' : ''} onClick={() => setActiveTab('conta')}>
          <User size={16} /> Minha Conta
        </button>
      </div>

      <div className="card">
        {activeTab === 'lotes' && (
          <div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'15px'}}>
              <div>
                <h3>Gerenciamento de Lotes</h3>
                <p className="text-muted" style={{marginBottom: '20px'}}>
                  Configure os lotes e suas respectivas tabelas de preços de produtos/serviços.
                </p>
              </div>
              <button className="btn-primary" onClick={openNewLote}><Plus size={16}/> Novo Lote</button>
            </div>

            <div className="table-responsive">
              <table className="table config-table">
                <thead>
                  <tr>
                    <th>Nome do Lote</th>
                    <th>Qtd. de Produtos</th>
                    <th>Status</th>
                    <th style={{textAlign: 'right'}}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lotes).map(([codigo, lote]) => (
                    <tr key={codigo}>
                      <td className="fw-bold">{lote.nome}</td>
                      <td><span className="badge info">{lote.produtos?.length || 0} produtos cadastrados</span></td>
                      <td>
                        <span className={`badge ${lote.ativo ? 'success' : 'danger'}`}>{lote.ativo ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td style={{textAlign: 'right'}}>
                        <button className="action-btn" onClick={() => openEditLote(codigo, lote)}><Edit2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'parametros' && (
          <div>
            <h3>Parâmetros do Sistema</h3>
            <div style={{ marginTop: '20px', display: 'grid', gap: '20px', maxWidth: '500px' }}>
              <div className="input-group">
                <label>Alíquota de ISS (%)</label>
                <input type="text" value={(aliquotaISS * 100).toFixed(2) + '%'} readOnly className="input-readonly" />
                <span style={{fontSize: 12, color: 'gray', marginTop: 4}}>Para alterar taxas globais, solicite modificação na base de dados.</span>
              </div>
              <div className="input-group">
                <label>Janela de "Edição Recente" (Dias)</label>
                <input type="text" value={diasEdicaoRecente} readOnly className="input-readonly" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div>
            <h3>Logs de Auditoria</h3>
            <p className="text-muted" style={{marginBottom: '20px'}}>Registro das últimas operações feitas no sistema (salvamentos de OS).</p>
            {loadingLogs ? <p>Carregando logs...</p> : (
              <div className="table-responsive" style={{maxHeight: '500px'}}>
                <table className="table config-table">
                  <thead>
                    <tr>
                      <th>Data/Hora</th>
                      <th>Usuário</th>
                      <th>Ação</th>
                      <th>Tabela</th>
                      <th>ID do Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length > 0 ? logs.map(log => (
                      <tr key={log.id}>
                        <td style={{whiteSpace: 'nowrap'}}>{formatDateTime(log.created_at)}</td>
                        <td>{log.user_email || 'Sistema'}</td>
                        <td>
                          <span className={`badge ${log.action === 'INSERT' ? 'success' : (log.action === 'UPDATE' ? 'info' : 'danger')}`}>
                            {log.action}
                          </span>
                        </td>
                        <td>{log.table_name}</td>
                        <td className="fw-bold">{log.record_id}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="5" style={{textAlign: 'center', padding: '20px'}}>Nenhum log encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'conta' && (
          <div>
            <h3>Minha Conta</h3>
            <p className="text-muted">Opções de conta e alteração de senha ficarão disponíveis aqui futuramente.</p>
          </div>
        )}
      </div>

      {/* LOTE EDIT MODAL */}
      {showLoteModal && (
        <div className="modal-overlay" onClick={() => setShowLoteModal(false)}>
          <div className="modal-content" style={{maxWidth: 800}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingLoteCodigo ? `Editar Lote: ${loteEditData.nome}` : 'Cadastrar Novo Lote'}</h3>
              <button className="btn-close" onClick={() => setShowLoteModal(false)}><X size={20}/></button>
            </div>
            <div className="modal-body" style={{padding: '25px'}}>
              <div className="grid-2 mb-20">
                <div className="input-group">
                  <label>Nome do Lote *</label>
                  <input type="text" value={loteEditData.nome} onChange={e => setLoteEditData({...loteEditData, nome: e.target.value})} placeholder="Ex: Lote 9" />
                </div>
                <div className="input-group">
                  <label>Status do Lote</label>
                  <select value={loteEditData.ativo} onChange={e => setLoteEditData({...loteEditData, ativo: e.target.value === 'true'})}>
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </div>
              </div>

              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: '30px', marginBottom: '15px'}}>
                <h4 style={{margin:0, color:'#1e293b'}}>Tabela de Produtos / Serviços do Lote</h4>
                <button type="button" className="btn-outline" onClick={addProduto} style={{padding: '6px 12px', fontSize: '13px'}}><Plus size={14}/> Adicionar Produto</button>
              </div>

              {loteEditData.produtos.length > 0 ? (
                <div className="table-responsive" style={{border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden'}}>
                  <table className="table" style={{margin: 0}}>
                    <thead style={{background: '#f9fafb'}}>
                      <tr>
                        <th>Produto (Ex: Captação de vídeo)</th>
                        <th>Unidade (Ex: meia diária)</th>
                        <th style={{width: 140}}>Valor Unit. (R$)</th>
                        <th style={{width: 50, textAlign: 'center'}}>Excluir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loteEditData.produtos.map((p, idx) => (
                        <tr key={p.id || idx}>
                          <td style={{padding: '8px'}}><input type="text" value={p.nome} onChange={e => updateProduto(idx, 'nome', e.target.value)} style={{width:'100%', padding:'8px'}} placeholder="Nome do serviço..."/></td>
                          <td style={{padding: '8px'}}><input type="text" value={p.unidade} onChange={e => updateProduto(idx, 'unidade', e.target.value)} style={{width:'100%', padding:'8px'}} placeholder="Unidade medida..."/></td>
                          <td style={{padding: '8px'}}><input type="number" step="any" value={p.valor} onChange={e => updateProduto(idx, 'valor', e.target.value)} style={{width:'100%', padding:'8px'}} /></td>
                          <td style={{padding: '8px', textAlign: 'center'}}>
                            <button type="button" className="btn-close" style={{color: '#ef4444', margin: '0 auto'}} onClick={() => removeProduto(idx)}><Trash2 size={18}/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{padding: '30px', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db'}}>
                  <p className="text-muted" style={{margin:0}}>Nenhum produto cadastrado neste lote. Clique em "Adicionar Produto" para montar a tabela de preços.</p>
                </div>
              )}

              <div style={{display:'flex', justifyContent:'flex-end', gap: '10px', marginTop: '30px'}}>
                <button type="button" className="btn-outline" onClick={() => setShowLoteModal(false)}>Cancelar</button>
                <button type="button" className="btn-primary" onClick={handleSaveLote}><Save size={18}/> Salvar Lote Completo</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Configuracoes;
