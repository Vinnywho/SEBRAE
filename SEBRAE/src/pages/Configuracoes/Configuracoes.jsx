import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';
import { 
  Settings, RefreshCw, Archive, User, FileText, Edit2, Plus, X, 
  Save, Trash2, Camera, Lock, Eye, KeyRound, CheckCircle2 
} from 'lucide-react';
import './Configuracoes.css';

const Configuracoes = () => {
  const { lotes, aliquotaISS, diasEdicaoRecente, reloadConfig } = useConfig();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('lotes');

  // Lotes State
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [editingLoteCodigo, setEditingLoteCodigo] = useState(null);
  const [loteEditData, setLoteEditData] = useState({ nome: '', ativo: true, produtos: [] });

  // Parâmetros Globais State
  const [issInput, setIssInput] = useState('16.33');
  const [diasInput, setDiasInput] = useState('5');
  const [isSavingParams, setIsSavingParams] = useState(false);

  // Logs State
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  // Minha Conta State
  const [userProfile, setUserProfile] = useState({
    email: '',
    fullName: '',
    cargo: '',
    telefone: '',
    avatarUrl: ''
  });
  const [passwords, setPasswords] = useState({ newPassword: '', confirmPassword: '' });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (aliquotaISS !== undefined) {
      setIssInput((aliquotaISS * 100).toFixed(2));
    }
    if (diasEdicaoRecente !== undefined) {
      setDiasInput(String(diasEdicaoRecente));
    }
  }, [aliquotaISS, diasEdicaoRecente]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
    if (activeTab === 'conta') {
      fetchUserProfile();
    }
  }, [activeTab]);

  const fetchUserProfile = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (user) {
        setUserProfile({
          email: user.email || '',
          fullName: user.user_metadata?.full_name || '',
          cargo: user.user_metadata?.cargo || '',
          telefone: user.user_metadata?.telefone || '',
          avatarUrl: user.user_metadata?.avatar_url || ''
        });
      }
    } catch (err) {
      console.error("Erro ao carregar usuário:", err);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      toast.error("Erro ao carregar logs: " + error.message);
    } else {
      setLogs(data || []);
    }
    setLoadingLogs(false);
  };

  const getAcaoResumo = (log) => {
    const ent = log.entidade;
    const acao = log.acao;
    const id = log.registro_id;

    if (ent === 'os') {
      if (acao === 'CRIACAO') return `Criou a Ordem de Serviço #${id}`;
      if (acao === 'EDICAO') return `Atualizou a Ordem de Serviço #${id}`;
      if (acao === 'EXCLUSAO') return `Excluiu a Ordem de Serviço #${id}`;
    }
    if (ent === 'lote') {
      if (acao === 'CRIACAO') return `Cadastrou um novo lote (${id})`;
      if (acao === 'EDICAO') return `Atualizou a tabela de preços do lote (${id})`;
      if (acao === 'EXCLUSAO') return `Removeu o lote (${id})`;
    }
    if (ent === 'config') {
      return `Atualizou parâmetros do sistema (${id})`;
    }
    return `${acao} em ${ent} (#${id})`;
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
    if (!loteEditData.nome.trim()) return toast.warning("O nome do lote é obrigatório.");
    
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
      
      toast.success('Lote salvo com sucesso!');
      setShowLoteModal(false);
      setEditingLoteCodigo(null);
      reloadConfig();
    } catch (err) {
      toast.error('Erro ao salvar lote: ' + err.message);
    }
  };

  const handleSaveParametros = async () => {
    setIsSavingParams(true);
    try {
      const aliquotaNum = Number(issInput.replace(',', '.')) / 100;
      const diasNum = parseInt(diasInput, 10);

      if (isNaN(aliquotaNum) || aliquotaNum < 0) {
        throw new Error("A alíquota de ISS deve ser um número válido.");
      }
      if (isNaN(diasNum) || diasNum < 0) {
        throw new Error("O número de dias para edição recente deve ser válido.");
      }

      const updates = [
        { chave: 'aliquota_iss', valor: aliquotaNum, updated_at: new Date().toISOString() },
        { chave: 'dias_edicao_recente', valor: diasNum, updated_at: new Date().toISOString() }
      ];

      for (const item of updates) {
        const { error } = await supabase
          .from('configuracoes')
          .upsert(item, { onConflict: 'chave' });
        if (error) throw error;
      }

      toast.success("Parâmetros globais atualizados com sucesso!");
      reloadConfig();
    } catch (err) {
      toast.error("Erro ao salvar parâmetros: " + err.message);
    } finally {
      setIsSavingParams(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      return toast.error("A foto deve ter no máximo 2MB.");
    }

    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw new Error(
          "Falha no upload para o Storage. Certifique-se de que o bucket 'avatars' foi criado no Supabase: " + 
          uploadError.message
        );
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      const { error: userError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });
      if (userError) throw userError;

      setUserProfile(prev => ({ ...prev, avatarUrl: publicUrl }));
      toast.success("Foto de perfil atualizada!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: userProfile.fullName,
          cargo: userProfile.cargo,
          telefone: userProfile.telefone
        }
      });
      if (error) throw error;
      toast.success("Informações do perfil atualizadas!");
    } catch (err) {
      toast.error("Erro ao atualizar perfil: " + err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwords.newPassword.length < 6) {
      return toast.warning("A nova senha deve ter pelo menos 6 caracteres.");
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      return toast.error("As senhas informadas não coincidem.");
    }

    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwords.newPassword
      });
      if (error) throw error;
      toast.success("Senha atualizada com sucesso!");
      setPasswords({ newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error("Erro ao alterar senha: " + err.message);
    } finally {
      setIsSavingPassword(false);
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0 }}>Parâmetros do Sistema</h3>
                <p className="text-muted" style={{ margin: '4px 0 0 0' }}>
                  Ajuste as taxas e regras padrão utilizadas nas Ordens de Serviço.
                </p>
              </div>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleSaveParametros} 
                disabled={isSavingParams}
              >
                <Save size={16} /> {isSavingParams ? 'Salvando...' : 'Salvar Parâmetros'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', maxWidth: '700px' }}>
              <div className="input-group">
                <label>Alíquota de ISS (%) *</label>
                <input 
                  type="text" 
                  value={issInput} 
                  onChange={(e) => setIssInput(e.target.value)} 
                  placeholder="Ex: 16.33"
                />
                <span style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  Percentual aplicado sobre o faturamento total da OS (ex: 16.33 para 16,33%).
                </span>
              </div>

              <div className="input-group">
                <label>Janela de "Edição Recente" (Dias) *</label>
                <input 
                  type="number" 
                  min="1"
                  max="90"
                  value={diasInput} 
                  onChange={(e) => setDiasInput(e.target.value)} 
                  placeholder="Ex: 5"
                />
                <span style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  Tempo em dias para exibir o ícone de relógio na lista de OSs editadas recentemente.
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div>
            <h3>Logs de Auditoria</h3>
            <p className="text-muted" style={{ marginBottom: '20px' }}>
              Histórico resumido das ações registradas no sistema (criação, edição e exclusão).
            </p>
            {loadingLogs ? <p>Carregando logs...</p> : (
              <div className="table-responsive" style={{ maxHeight: '550px' }}>
                <table className="table config-table">
                  <thead>
                    <tr>
                      <th>Data/Hora</th>
                      <th>Usuário</th>
                      <th>Ação Resumida</th>
                      <th>Tipo</th>
                      <th>ID Registro</th>
                      <th style={{ textAlign: 'center' }}>Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length > 0 ? logs.map(log => (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{formatDateTime(log.created_at)}</td>
                        <td style={{ fontSize: 13, color: '#475569' }}>{log.user_email || 'Sistema'}</td>
                        <td>
                          <div className="log-summary-text">
                            {getAcaoResumo(log)}
                          </div>
                        </td>
                        <td>
                          <span className={`log-entity-tag ${log.entidade}`}>
                            {log.entidade}
                          </span>
                        </td>
                        <td className="fw-bold" style={{ fontSize: 13 }}>{log.registro_id}</td>
                        <td style={{ textAlign: 'center' }}>
                          {(log.dados_novos || log.dados_antigos) && (
                            <button
                              type="button"
                              className="action-btn"
                              onClick={() => setSelectedLog(log)}
                              title="Visualizar snapshot de dados"
                            >
                              <Eye size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px' }}>Nenhum log de auditoria encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'conta' && (
          <div className="profile-card">
            <div>
              <h3>Minha Conta</h3>
              <p className="text-muted">Gerencie suas informações de perfil, foto e segurança de acesso.</p>
            </div>

            {/* FOTO DE PERFIL / AVATAR */}
            <div className="avatar-upload-section">
              <div className="profile-avatar-preview">
                {userProfile.avatarUrl ? (
                  <img src={userProfile.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span>{userProfile.fullName ? userProfile.fullName.charAt(0).toUpperCase() : (userProfile.email ? userProfile.email.charAt(0).toUpperCase() : 'U')}</span>
                )}
              </div>
              <div className="avatar-actions">
                <label className="btn-outline" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, width: 'fit-content' }}>
                  <Camera size={16} /> {uploadingAvatar ? 'Enviando...' : 'Alterar Foto de Perfil'}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleAvatarUpload} 
                    style={{ display: 'none' }} 
                    disabled={uploadingAvatar}
                  />
                </label>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Formatos suportados: PNG, JPG ou WEBP (máx. 2MB).</span>
              </div>
            </div>

            {/* DADOS BÁSICOS DO PERFIL */}
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 15, maxWidth: 600 }}>
              <h4 style={{ margin: '10px 0 5px 0', color: '#1e293b' }}>Dados Pessoais</h4>
              
              <div className="input-group">
                <label>E-mail (Login)</label>
                <input type="email" value={userProfile.email} readOnly className="input-readonly" />
              </div>

              <div className="grid-2">
                <div className="input-group">
                  <label>Nome Completo</label>
                  <input 
                    type="text" 
                    value={userProfile.fullName} 
                    onChange={e => setUserProfile({ ...userProfile, fullName: e.target.value })} 
                    placeholder="Ex: Vinícius Oliveira"
                  />
                </div>
                <div className="input-group">
                  <label>Cargo / Função</label>
                  <input 
                    type="text" 
                    value={userProfile.cargo} 
                    onChange={e => setUserProfile({ ...userProfile, cargo: e.target.value })} 
                    placeholder="Ex: Gestor de Produção"
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Telefone / WhatsApp</label>
                <input 
                  type="text" 
                  value={userProfile.telefone} 
                  onChange={e => setUserProfile({ ...userProfile, telefone: e.target.value })} 
                  placeholder="Ex: (11) 98765-4321"
                />
              </div>

              <div>
                <button type="submit" className="btn-primary" disabled={isSavingProfile}>
                  <Save size={16} /> {isSavingProfile ? 'Salvando...' : 'Salvar Alterações de Perfil'}
                </button>
              </div>
            </form>

            <div style={{ height: 1, background: '#e2e8f0', margin: '10px 0' }}></div>

            {/* SEGURANÇA E SENHA */}
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 15, maxWidth: 600 }}>
              <h4 style={{ margin: '10px 0 5px 0', color: '#1e293b' }}>Segurança & Alteração de Senha</h4>
              
              <div className="grid-2">
                <div className="input-group">
                  <label>Nova Senha</label>
                  <input 
                    type="password" 
                    value={passwords.newPassword} 
                    onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })} 
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="input-group">
                  <label>Confirmar Nova Senha</label>
                  <input 
                    type="password" 
                    value={passwords.confirmPassword} 
                    onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })} 
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>

              <div>
                <button type="submit" className="btn-outline" disabled={isSavingPassword}>
                  <KeyRound size={16} /> {isSavingPassword ? 'Atualizando...' : 'Atualizar Senha'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* MODAL DE DETALHES DO LOG */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Detalhes do Registro de Auditoria #{selectedLog.id}</h3>
              <button className="btn-close" onClick={() => setSelectedLog(null)}><X size={20}/></button>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <div style={{ marginBottom: 15, fontSize: 13 }}>
                <div><strong>Ação:</strong> {selectedLog.acao}</div>
                <div><strong>Entidade:</strong> {selectedLog.entidade} ({selectedLog.registro_id})</div>
                <div><strong>Data:</strong> {formatDateTime(selectedLog.created_at)}</div>
                <div><strong>Usuário:</strong> {selectedLog.user_email || 'Sistema'}</div>
              </div>

              {selectedLog.dados_novos && (
                <div style={{ marginBottom: 15 }}>
                  <h5 style={{ margin: '0 0 6px 0', color: '#1e293b' }}>Dados Novos:</h5>
                  <pre className="json-viewer">
                    {JSON.stringify(selectedLog.dados_novos, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.dados_antigos && (
                <div>
                  <h5 style={{ margin: '0 0 6px 0', color: '#64748b' }}>Dados Anteriores:</h5>
                  <pre className="json-viewer" style={{ opacity: 0.85 }}>
                    {JSON.stringify(selectedLog.dados_antigos, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
