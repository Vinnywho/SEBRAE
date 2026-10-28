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

  const FIELD_LABELS = {
    nome_os: 'Nome da OS',
    cidade: 'Cidade',
    lote: 'Lote',
    endereco: 'Endereço',
    adicionais: 'Adicionais',
    observacoes: 'Observações',
    valor_unitario_total: 'Valor Total',
    curso_responsavel: 'Custo da Equipe',
    valor_iss: 'Valor ISS',
    lucro_previsto: 'Lucro Previsto',
    nfs_e: 'NFS-e',
    status_conta_azul: 'Status Conta Azul',
    aliquota_iss: 'Alíquota ISS',
    dias_edicao_recente: 'Dias Edição Recente',
    nome: 'Nome do Lote',
    ativo: 'Status do Lote'
  };

  const formatValue = (key, val) => {
    if (val === null || val === undefined || val === '') return '(vazio)';
    if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
    if (typeof val === 'number') {
      if (key.includes('valor') || key.includes('curso') || key.includes('lucro') || key.includes('iss') || key.includes('adicionais')) {
        return `R$ ${val.toFixed(2).replace('.', ',')}`;
      }
      if (key === 'aliquota_iss') {
        return `${(val * 100).toFixed(2)}%`;
      }
      return String(val);
    }
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const calcularDiferencas = (antigo, novo) => {
    if (!antigo && !novo) return [];
    
    if (!antigo && novo) {
      return Object.keys(novo)
        .filter(k => !['created_at', 'updated_at', 'detalhes', 'responsaveis', 'produtos'].includes(k) && novo[k] !== null && novo[k] !== '')
        .map(k => ({
          campo: FIELD_LABELS[k] || k,
          chave: k,
          antes: '-',
          depois: formatValue(k, novo[k])
        }));
    }

    if (antigo && !novo) {
      return [{ campo: 'Status', chave: 'status', antes: 'Ativo', depois: 'Excluído' }];
    }

    const diffs = [];
    const allKeys = Array.from(new Set([...Object.keys(antigo), ...Object.keys(novo)]));

    for (const key of allKeys) {
      if (['detalhes', 'responsaveis', 'produtos', 'created_at', 'updated_at', 'numero_os'].includes(key)) {
        continue;
      }

      const valAntigo = antigo[key];
      const valNovo = novo[key];

      const isAntigoEmpty = valAntigo === null || valAntigo === undefined || valAntigo === '';
      const isNovoEmpty = valNovo === null || valNovo === undefined || valNovo === '';
      if (isAntigoEmpty && isNovoEmpty) continue;

      const numAntigo = Number(valAntigo);
      const numNovo = Number(valNovo);
      if (!isNaN(numAntigo) && !isNaN(numNovo) && typeof valAntigo === 'number' && typeof valNovo === 'number') {
        if (Math.abs(numAntigo - numNovo) < 0.001) continue;
      } else if (String(valAntigo ?? '') === String(valNovo ?? '')) {
        continue;
      }

      diffs.push({
        campo: FIELD_LABELS[key] || key,
        chave: key,
        antes: formatValue(key, valAntigo),
        depois: formatValue(key, valNovo)
      });
    }

    if ('detalhes' in antigo || 'detalhes' in novo) {
      const dAntigo = antigo.detalhes || [];
      const dNovo = novo.detalhes || [];
      if (JSON.stringify(dAntigo) !== JSON.stringify(dNovo)) {
        diffs.push({
          campo: 'Serviços da OS',
          chave: 'detalhes',
          antes: `${dAntigo.length} serviço(s)`,
          depois: `${dNovo.length} serviço(s)`,
          detalheAntigo: dAntigo,
          detalheNovo: dNovo,
          tipoArray: 'detalhes'
        });
      }
    }

    if ('responsaveis' in antigo || 'responsaveis' in novo) {
      const rAntigo = antigo.responsaveis || [];
      const rNovo = novo.responsaveis || [];
      if (JSON.stringify(rAntigo) !== JSON.stringify(rNovo)) {
        if (rAntigo.length !== rNovo.length) {
          diffs.push({
            campo: 'Equipe / Responsáveis',
            chave: 'responsaveis',
            antes: `${rAntigo.length} responsável(is)`,
            depois: `${rNovo.length} responsável(is)`,
            respAntigo: rAntigo,
            respNovo: rNovo,
            tipoArray: 'responsaveis'
          });
        }

        // Compara cada responsável para exibir campos alterados pontuais (ex: Status Pgto, Data Pgto)
        const mapAntigo = new Map(rAntigo.map(r => [r.nome || '', r]));
        const mapNovo = new Map(rNovo.map(r => [r.nome || '', r]));

        mapNovo.forEach((respNovo, nome) => {
          const respAntigo = mapAntigo.get(nome);
          if (respAntigo) {
            const stAntigo = respAntigo.status_pagamento || 'Pendente';
            const stNovo = respNovo.status_pagamento || 'Pendente';
            if (stAntigo !== stNovo) {
              diffs.push({
                campo: `Status Pgto (${nome || 'Responsável'})`,
                chave: `status_pagamento_${nome}`,
                antes: stAntigo,
                depois: stNovo
              });
            }

            const dtAntiga = respAntigo.data_pagamento || '';
            const dtNova = respNovo.data_pagamento || '';
            if (dtAntiga !== dtNova) {
              diffs.push({
                campo: `Data Pgto (${nome || 'Responsável'})`,
                chave: `data_pagamento_${nome}`,
                antes: dtAntiga ? dtAntiga.split('-').reverse().join('/') : '(vazio)',
                depois: dtNova ? dtNova.split('-').reverse().join('/') : '(vazio)'
              });
            }
          }
        });

        // Caso não tenha entrado nas condições acima mas o JSON seja diferente
        const jaAdicionouResp = diffs.some(d => d.chave === 'responsaveis' || d.chave.startsWith('status_pagamento_') || d.chave.startsWith('data_pagamento_'));
        if (!jaAdicionouResp) {
          diffs.push({
            campo: 'Equipe / Responsáveis',
            chave: 'responsaveis',
            antes: `${rAntigo.length} responsável(is)`,
            depois: `${rNovo.length} responsável(is)`,
            respAntigo: rAntigo,
            respNovo: rNovo,
            tipoArray: 'responsaveis'
          });
        }
      }
    }

    if ('produtos' in antigo || 'produtos' in novo) {
      const pAntigo = antigo.produtos || [];
      const pNovo = novo.produtos || [];
      if (JSON.stringify(pAntigo) !== JSON.stringify(pNovo)) {
        diffs.push({
          campo: 'Tabela de Preços',
          chave: 'produtos',
          antes: `${pAntigo.length} produto(s)`,
          depois: `${pNovo.length} produto(s)`
        });
      }
    }

    return diffs;
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
              <div className="table-responsive" style={{ maxHeight: 'auto' }}>
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
                          {(() => {
                            if (log.acao === 'EDICAO') {
                              const diffs = calcularDiferencas(log.dados_antigos, log.dados_novos);
                              if (diffs.length === 0) return null;
                              return (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                                  <span style={{ fontSize: '11px', color: '#64748b', alignSelf: 'center' }}>Campos alterados:</span>
                                  {diffs.map((d, i) => (
                                    <span key={i} className="diff-badge">
                                      {d.campo}
                                    </span>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          })()}
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
      {selectedLog && (() => {
        const diffs = calcularDiferencas(selectedLog.dados_antigos, selectedLog.dados_novos);
        const isEdicao = selectedLog.acao === 'EDICAO';
        const isCriacao = selectedLog.acao === 'CRIACAO';

        return (
          <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
            <div className="modal-content" style={{ maxWidth: 750, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Detalhes da Auditoria #{selectedLog.id}</h3>
                <button className="btn-close" onClick={() => setSelectedLog(null)}><X size={20}/></button>
              </div>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 15, fontSize: 13, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div><strong>Ação:</strong> <span className={`badge ${isCriacao ? 'success' : isEdicao ? 'warning' : 'danger'}`}>{selectedLog.acao}</span></div>
                  <div><strong>Entidade:</strong> <span className={`log-entity-tag ${selectedLog.entidade}`}>{selectedLog.entidade}</span> (#{selectedLog.registro_id})</div>
                  <div><strong>Data/Hora:</strong> {formatDateTime(selectedLog.created_at)}</div>
                  <div><strong>Usuário:</strong> {selectedLog.user_email || 'Sistema'}</div>
                </div>

                {/* VISUALIZAÇÃO DE DIFERENÇAS DE CAMPOS */}
                {isEdicao && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#1e293b', fontSize: 15 }}>
                      Campos Alterados ({diffs.length})
                    </h4>
                    {diffs.length > 0 ? (
                      <table className="diff-table">
                        <thead>
                          <tr>
                            <th style={{ width: '30%' }}>Campo</th>
                            <th style={{ width: '35%' }}>Valor Anterior</th>
                            <th style={{ width: '35%' }}>Novo Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diffs.map((d, idx) => (
                            <tr key={idx}>
                              <td><strong>{d.campo}</strong></td>
                              <td><span className="diff-val-old">{d.antes}</span></td>
                              <td><span className="diff-val-new">{d.depois}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-muted" style={{ fontSize: 13 }}>Nenhuma alteração pontual detectada nos campos principais.</p>
                    )}
                  </div>
                )}

                {isCriacao && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#1e293b', fontSize: 15 }}>
                      Dados Cadastrados
                    </h4>
                    {diffs.length > 0 ? (
                      <table className="diff-table">
                        <thead>
                          <tr>
                            <th style={{ width: '40%' }}>Campo</th>
                            <th style={{ width: '60%' }}>Valor Inicial</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diffs.map((d, idx) => (
                            <tr key={idx}>
                              <td><strong>{d.campo}</strong></td>
                              <td><span className="diff-val-new">{d.depois}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                )}

                {/* DETALHES DE ARRAYS SE HOUVER (SERVICOS / RESPONSAVEIS) */}
                {selectedLog.dados_novos?.detalhes && selectedLog.dados_novos.detalhes.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h5 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>
                      Serviços da OS ({selectedLog.dados_novos.detalhes.length})
                    </h5>
                    <div className="table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                      <table className="table" style={{ margin: 0, fontSize: '12px' }}>
                        <thead style={{ background: '#f8fafc' }}>
                          <tr>
                            <th>Serviço</th>
                            <th>Data</th>
                            <th>Gravação</th>
                            <th>Saída</th>
                            <th>Diárias</th>
                            <th>Valor Unit.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedLog.dados_novos.detalhes.map((det, i) => (
                            <tr key={i}>
                              <td className="fw-medium">{det.servico || '-'}</td>
                              <td>{det.data || '-'}</td>
                              <td>{det.horario_gravacao || '-'}</td>
                              <td>{det.horario_saida || '-'}</td>
                              <td>{det.diarias || det.quantidade_diarias || 1}</td>
                              <td>R$ {Number(det.valor_unitario || 0).toFixed(2).replace('.', ',')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selectedLog.dados_novos?.responsaveis && selectedLog.dados_novos.responsaveis.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h5 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>
                      Equipe e Pagamentos ({selectedLog.dados_novos.responsaveis.length})
                    </h5>
                    <div className="table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                      <table className="table" style={{ margin: 0, fontSize: '12px' }}>
                        <thead style={{ background: '#f8fafc' }}>
                          <tr>
                            <th>Nome</th>
                            <th>Função</th>
                            <th>Freelance</th>
                            <th>Status Pagamento</th>
                            <th>Agendamento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedLog.dados_novos.responsaveis.map((resp, i) => (
                            <tr key={i}>
                              <td className="fw-medium">{resp.nome || '-'}</td>
                              <td>{resp.funcao || '-'}</td>
                              <td>R$ {Number(resp.valor_freelance || 0).toFixed(2).replace('.', ',')}</td>
                              <td>
                                <span className={`badge ${resp.status_pagamento === 'Pago' ? 'success' : resp.status_pagamento === 'Não se aplica' ? 'info' : 'warning'}`}>
                                  {resp.status_pagamento || 'Pendente'}
                                </span>
                              </td>
                              <td>{resp.data_pagamento_agendada || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* EXPANDABLE RAW JSON SNAPSHOT */}
                <details style={{ marginTop: 20, cursor: 'pointer' }}>
                  <summary style={{ fontSize: 13, fontWeight: 600, color: '#64748b', outline: 'none' }}>
                    Ver Snapshots Brutos (JSON Técnico)
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    {selectedLog.dados_novos && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>Dados Novos:</span>
                        <pre className="json-viewer" style={{ marginTop: 4 }}>
                          {JSON.stringify(selectedLog.dados_novos, null, 2)}
                        </pre>
                      </div>
                    )}
                    {selectedLog.dados_antigos && (
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Dados Anteriores:</span>
                        <pre className="json-viewer" style={{ opacity: 0.85, marginTop: 4 }}>
                          {JSON.stringify(selectedLog.dados_antigos, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>

              </div>
            </div>
          </div>
        );
      })()}

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
