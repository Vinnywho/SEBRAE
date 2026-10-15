import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { getDayOfWeek } from '../../utils/format';
import { Edit2, Trash2, Plus, ArrowLeft, Save, Edit, Printer } from 'lucide-react';
import sebraeLogo from '../../assets/img/sebrae.svg';
import './OSForm.css';

const OSForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const osEditId = searchParams.get('id');
  const isViewMode = searchParams.get('view') === 'true';
  const { lotes, aliquotaISS } = useConfig();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(!!osEditId);
  const [isSaving, setIsSaving] = useState(false);
  const [lastEdited, setLastEdited] = useState(null);

  const [formData, setFormData] = useState({
    numeroOS: '', lote: '', nomeOS: '', cidade: '', endereco: '', adicionais: '', observacoes: '',
    nfsE: '', statusContaAzul: 'Pendente'
  });

  const [detalhes, setDetalhes] = useState([]);
  const [detalheInput, setDetalheInput] = useState({
    data: '', responsavel: '', horarioGravacao: '', horarioSaida: '', servico: '', notasServico: '', quantidadeDiarias: 1, produtoId: '', valorUnitarioBaseLegado: 0
  });
  const [editDetalheIndex, setEditDetalheIndex] = useState(null);

  const [despesasResponsaveis, setDespesasResponsaveis] = useState({});
  const [activeRespTab, setActiveRespTab] = useState('');

  // Fetch initial data
  useEffect(() => {
    if (!osEditId) return;
    const fetchOSData = async () => {
      try {
        const { data: osData, error: osError } = await supabase
          .from('ordens_servico')
          .select('*')
          .eq('numero_os', osEditId)
          .single();
        if (osError) throw osError;

        const { data: detData } = await supabase.from('os_detalhes').select('*').eq('numero_os', osEditId);
        const { data: respData } = await supabase.from('os_responsaveis').select('*').eq('numero_os', osEditId);

        setFormData({
          numeroOS: osData.numero_os,
          lote: osData.lote || '',
          nomeOS: osData.nome_os || osData.endereco || '',
          cidade: osData.cidade || '',
          endereco: osData.nome_os || osData.endereco || '',
          adicionais: osData.adicionais || '',
          observacoes: osData.observacoes || '',
          nfsE: osData.nfs_e || '',
          statusContaAzul: osData.status_conta_azul || 'Pendente'
        });

        if (osData.updated_at && osData.updated_by_email) {
            setLastEdited({ date: osData.updated_at, by: osData.updated_by_email });
        }

        const mappedDetalhes = (detData || []).map(d => {
          const qtd = Number(d.quantidade_diarias) || 1;
          const total = Number(d.valor_unitario) || 0;
          return {
            data: d.data_servico || '',
            responsavel: d.responsavel_servico || '',
            horarioGravacao: d.horario_gravacao || '',
            horarioSaida: d.horario_saida || '',
            servico: d.servico || '',
            notasServico: '',
            produtoId: 'legacy',
            quantidadeDiarias: qtd,
            valorUnitarioBaseLegado: total / qtd,
            valorUnitario: total
          };
        });
        setDetalhes(mappedDetalhes);

        const respDict = {};
        (respData || []).forEach(r => {
          respDict[r.nome] = {
            valorFreelance: r.valor_freelance || '',
            reembolsoConducao: r.reembolso_conducao || '',
            reembolsoAlimentacao: r.reembolso_alimentacao || '',
            reembolsoHospedagem: r.reembolso_hospedagem || '',
            agendamento: r.agendamento || '',
            statusPagamento: r.status_pagamento || '',
            dataPagamento: r.data_pagamento || ''
          };
        });
        setDespesasResponsaveis(respDict);
        if (Object.keys(respDict).length > 0) setActiveRespTab(Object.keys(respDict)[0]);

      } catch (error) {
        alert("Erro ao carregar OS");
        navigate('/lista-os');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOSData();
  }, [osEditId, navigate]);

  // Sync Responsáveis list with Detalhes
  useEffect(() => {
    const activeResponsaveis = new Set(detalhes.map(d => d.responsavel).filter(Boolean));
    setDespesasResponsaveis(prev => {
      const newDict = { ...prev };
      let changed = false;
      activeResponsaveis.forEach(nome => {
        if (!newDict[nome]) {
          newDict[nome] = {
            valorFreelance: '', reembolsoConducao: '', reembolsoAlimentacao: '',
            reembolsoHospedagem: '', agendamento: '', statusPagamento: '', dataPagamento: ''
          };
          changed = true;
        }
      });
      Object.keys(newDict).forEach(nome => {
        if (!activeResponsaveis.has(nome)) {
          delete newDict[nome];
          changed = true;
        }
      });
      return changed ? newDict : prev;
    });

    if (activeResponsaveis.size > 0 && !activeResponsaveis.has(activeRespTab)) {
      setActiveRespTab(Array.from(activeResponsaveis)[0]);
    } else if (activeResponsaveis.size === 0) {
      setActiveRespTab('');
    }
  }, [detalhes]);

  // Calculated fields
  const financeiro = useMemo(() => {
    const faturamento = detalhes.reduce((acc, d) => acc + (Number(d.valorUnitario) || 0), 0);
    const iss = faturamento * aliquotaISS;
    let custoResponsaveis = 0;
    Object.values(despesasResponsaveis).forEach(r => {
      custoResponsaveis += (Number(r.valorFreelance) || 0) + (Number(r.reembolsoConducao) || 0) +
                           (Number(r.reembolsoAlimentacao) || 0) + (Number(r.reembolsoHospedagem) || 0);
    });
    const lucro = faturamento - iss - custoResponsaveis;
    const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;
    return { faturamento, iss, custoResponsaveis, lucro, margem };
  }, [detalhes, despesasResponsaveis, aliquotaISS]);

  const handleInput = e => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleDetInput = e => setDetalheInput({ ...detalheInput, [e.target.name]: e.target.value });
  const handleRespInput = e => {
    if (!activeRespTab) return;
    setDespesasResponsaveis(prev => ({
      ...prev,
      [activeRespTab]: { ...prev[activeRespTab], [e.target.name]: e.target.value }
    }));
  };

  const addOrUpdateDetalhe = () => {
    if (!formData.lote || !detalheInput.responsavel || !detalheInput.produtoId) {
      return toast.warning("Preencha o Lote no Passo 1, o Responsável e selecione o Produto.");
    }
    
    let baseValue = 0;
    let nomeServicoFinal = detalheInput.servico;

    if (detalheInput.produtoId !== 'legacy') {
      const p = lotes[formData.lote]?.produtos?.find(x => x.id === detalheInput.produtoId);
      if (p) {
        baseValue = p.valor;
        nomeServicoFinal = `[${p.nome} - ${p.unidade}]` + (detalheInput.notasServico ? ` ${detalheInput.notasServico}` : '');
      }
    } else {
      baseValue = detalheInput.valorUnitarioBaseLegado || 0;
      nomeServicoFinal = detalheInput.notasServico ? `${detalheInput.servico} | ${detalheInput.notasServico}` : detalheInput.servico;
    }

    const novoDetalhe = { 
      ...detalheInput, 
      servico: nomeServicoFinal,
      valorUnitario: baseValue * Number(detalheInput.quantidadeDiarias)
    };

    if (editDetalheIndex !== null) {
      setDetalhes(prev => {
        const arr = [...prev];
        arr[editDetalheIndex] = novoDetalhe;
        return arr;
      });
      setEditDetalheIndex(null);
      toast.info("Detalhe atualizado.");
    } else {
      setDetalhes(prev => [...prev, novoDetalhe]);
      toast.success("Detalhe adicionado à OS.");
    }
    setDetalheInput({ data: '', responsavel: '', horarioGravacao: '', horarioSaida: '', servico: '', notasServico: '', quantidadeDiarias: 1, produtoId: '', valorUnitarioBaseLegado: 0 });
  };

  const editDetalhe = (idx) => {
    if (isViewMode) return;
    setDetalheInput(detalhes[idx]);
    setEditDetalheIndex(idx);
  };

  const delDetalhe = (idx) => {
    if (isViewMode) return;
    setDetalhes(prev => prev.filter((_, i) => i !== idx));
    if (editDetalheIndex === idx) {
      setEditDetalheIndex(null);
      setDetalheInput({ data: '', responsavel: '', horarioGravacao: '', horarioSaida: '', servico: '', notasServico: '', quantidadeDiarias: 1, produtoId: '', valorUnitarioBaseLegado: 0 });
    }
    toast.info("Detalhe removido.");
  };

  const exportarPDF = () => {
    window.print();
  };

  const salvar = async (e) => {
    e.preventDefault();
    if (!formData.numeroOS) return toast.warning("Número da OS é obrigatório.");
    setIsSaving(true);
    try {
      const payloadOs = {
        numero_os: formData.numeroOS, 
        lote: formData.lote, 
        nome_os: formData.nomeOS,
        cidade: formData.cidade,
        endereco: formData.nomeOS,
        adicionais: formData.adicionais, 
        observacoes: formData.observacoes, 
        nfs_e: formData.nfsE,
        status_conta_azul: formData.statusContaAzul,
        valor_unitario_total: financeiro.faturamento, 
        curso_responsavel: financeiro.custoResponsaveis,
        valor_iss: financeiro.iss, 
        lucro_previsto: financeiro.lucro
      };
      const payloadDet = detalhes.map(d => ({
        valor_unitario: d.valorUnitario, data_servico: d.data, responsavel_servico: d.responsavel,
        horario_gravacao: d.horarioGravacao, horario_saida: d.horarioSaida, servico: d.servico, quantidade_diarias: Number(d.quantidadeDiarias)
      }));
      const payloadResp = Object.entries(despesasResponsaveis).map(([nome, r]) => ({
        nome, valor_freelance: r.valorFreelance, reembolso_conducao: r.reembolsoConducao,
        reembolso_alimentacao: r.reembolsoAlimentacao, reembolso_hospedagem: r.reembolsoHospedagem,
        agendamento: r.agendamento, status_pagamento: r.statusPagamento, data_pagamento: r.dataPagamento
      }));

      const { error } = await supabase.rpc('salvar_os', {
        p_os: payloadOs, p_detalhes: payloadDet, p_responsaveis: payloadResp, p_is_novo: !osEditId
      });
      
      if (error) {
        if(error.code === '23505') throw new Error("O número de OS já existe.");
        throw error;
      }
      toast.success("Ordem de Serviço salva com sucesso!");
      if (!osEditId) navigate(`/os-form?id=${formData.numeroOS}`);
    } catch (err) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div style={{padding: 20}}>Carregando...</div>;

  const respData = despesasResponsaveis[activeRespTab] || {};
  const produtosLoteAtual = lotes[formData.lote]?.produtos || [];

  return (
    <>
      <div className="os-form-layout">
      <div className="os-form-main">
        <div className="form-header-title">
          <div className="form-header-left">
            <button className="btn-icon-back" onClick={() => navigate('/lista-os')} title="Voltar para a lista">
              <ArrowLeft size={18} />
            </button>
            <h2 style={{ margin: 0 }}>
              {isViewMode ? `Visualizando OS ${osEditId}` : (osEditId ? `Editando OS ${osEditId}` : 'Nova Ordem de Serviço')}
            </h2>
            {lastEdited && (
              <span className="badge info" style={{ fontWeight: 'normal' }}>
                Última edição: {new Date(lastEdited.date).toLocaleString('pt-BR')} por {lastEdited.by}
              </span>
            )}
          </div>

          <div className="form-header-right">
            <button type="button" className="btn-outline" onClick={exportarPDF} title="Exportar PDF da Ordem de Serviço">
              <Printer size={16} /> Exportar PDF
            </button>
            
            {isViewMode && (
              <button type="button" className="btn-primary" onClick={() => navigate(`/os-form?id=${osEditId}`)}>
                <Edit size={16} /> Editar OS
              </button>
            )}
          </div>
        </div>

        <form id="osform" onSubmit={salvar}>
          {/* SEÇÃO 1: Dados Básicos */}
          <section className="card form-section">
            <h3 className="section-title"><span className="step-num">1</span> Dados da OS</h3>
            <div className="grid-3">
              <div className="input-group">
                <label>Número da OS *</label>
                <input required type="text" name="numeroOS" value={formData.numeroOS} onChange={handleInput} readOnly={!!osEditId} className={osEditId ? 'readonly' : ''} disabled={isViewMode} />
              </div>
              <div className="input-group">
                <label>Lote *</label>
                <select required name="lote" value={formData.lote} onChange={handleInput} disabled={isViewMode}>
                  <option value="">Selecione um lote...</option>
                  {Object.entries(lotes).map(([cod, l]) => l.ativo && <option key={cod} value={cod}>{l.nome}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Nome da OS *</label>
                <input required type="text" name="nomeOS" value={formData.nomeOS} onChange={handleInput} placeholder="Ex: Vídeo Sebrae Delas" disabled={isViewMode} />
              </div>
            </div>
            <div className="grid-3 mt-15">
              <div className="input-group">
                <label>Cidade</label>
                <input type="text" name="cidade" value={formData.cidade} onChange={handleInput} placeholder="Ex: São Paulo" disabled={isViewMode} />
              </div>
              <div className="input-group">
                <label>Adicionais</label>
                <textarea name="adicionais" value={formData.adicionais} onChange={handleInput} rows="2" disabled={isViewMode}/>
              </div>
              <div className="input-group">
                <label>Observações / Briefing</label>
                <textarea name="observacoes" value={formData.observacoes} onChange={handleInput} rows="2" disabled={isViewMode}/>
              </div>
            </div>
          </section>

          {/* SEÇÃO 2: Detalhes */}
          <section className="card form-section">
            <h3 className="section-title"><span className="step-num">2</span> Detalhes & Valores Unitários</h3>
            
            {detalhes.length > 0 && (
              <div className="table-responsive mb-20">
                <table className="table details-table">
                  <thead>
                    <tr>
                      <th>Data</th><th>Dia Semana</th><th>Responsável</th><th>Gravação</th><th>Saída</th>
                      <th>Qtd.</th><th>Valor (R$)</th>
                      {!isViewMode && <th style={{textAlign:'right'}}>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detalhes.map((d, i) => (
                      <tr key={i} className={editDetalheIndex === i ? 'editing-row' : ''}>
                        <td style={{whiteSpace: 'nowrap'}}>{d.data ? d.data.split('-').reverse().join('/') : '-'}</td>
                        <td className="text-muted">{getDayOfWeek(d.data)}</td>
                        <td className="fw-bold">{d.responsavel}<br/><span style={{fontWeight:'normal', fontSize:12, color:'#6b7280'}}>{d.servico}</span></td>
                        <td>{d.horarioGravacao||'-'}</td><td>{d.horarioSaida||'-'}</td>
                        <td><span className="badge info">{d.quantidadeDiarias}</span></td>
                        <td>R$ {Number(d.valorUnitario).toFixed(2).replace('.',',')}</td>
                        {!isViewMode && (
                          <td style={{textAlign:'right'}}>
                            <button type="button" className="action-btn" onClick={() => editDetalhe(i)}><Edit2 size={16}/></button>
                            <button type="button" className="action-btn danger" onClick={() => delDetalhe(i)}><Trash2 size={16}/></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isViewMode && (
              <div className="form-panel">
                <div className="grid-3 mb-15">
                  <div className="input-group">
                    <label>Data</label><input type="date" name="data" value={detalheInput.data} onChange={handleDetInput}/>
                  </div>
                  <div className="input-group">
                    <label>Horário Entrada</label><input type="time" name="horarioGravacao" value={detalheInput.horarioGravacao} onChange={handleDetInput}/>
                  </div>
                  <div className="input-group">
                    <label>Horário Saída</label><input type="time" name="horarioSaida" value={detalheInput.horarioSaida} onChange={handleDetInput}/>
                  </div>
                </div>
                
                <div className="grid-3 mb-15">
                  <div className="input-group">
                    <label>Nome do Responsável *</label><input type="text" name="responsavel" value={detalheInput.responsavel} onChange={handleDetInput} placeholder="Ex: João Silva"/>
                  </div>
                  
                  <div className="input-group span-2-responsive" style={{gridColumn: 'span 2'}}>
                    <label>Produto / Serviço do Lote *</label>
                    <select 
                      name="produtoId" 
                      value={detalheInput.produtoId} 
                      onChange={handleDetInput}
                      disabled={!formData.lote}
                      style={{background: !formData.lote ? '#f3f4f6' : 'white'}}
                    >
                      <option value="">{formData.lote ? 'Selecione a tabela de preços...' : 'Selecione um Lote no Passo 1 primeiro'}</option>
                      {produtosLoteAtual.map(p => (
                        <option key={p.id} value={p.id}>{p.nome} - {p.unidade} (R$ {p.valor.toFixed(2).replace('.',',')})</option>
                      ))}
                      {detalheInput.produtoId === 'legacy' && (
                        <option value="legacy">Item Antigo (Manter valor pré-calculado)</option>
                      )}
                    </select>
                  </div>
                </div>
                
                <div className="grid-3 mb-15">
                  <div className="input-group">
                    <label>Quantidade (Diárias/Horas) *</label>
                    <input type="number" step="any" min="0" name="quantidadeDiarias" value={detalheInput.quantidadeDiarias} onChange={handleDetInput} />
                  </div>
                  <div className="input-group span-2-responsive" style={{gridColumn: 'span 2'}}>
                    <label>Endereço / Minutagem (Opcional)</label>
                    <textarea name="notasServico" value={detalheInput.notasServico} onChange={handleDetInput} placeholder="Ex: Av. Paulista, 1000 - Minutagem: 02:30" rows="1"/>
                  </div>
                </div>
                
                <div style={{display:'flex', justifyContent:'flex-end', gap: '10px', flexWrap: 'wrap'}}>
                  {editDetalheIndex !== null && (
                    <button type="button" className="btn-outline" onClick={() => {setEditDetalheIndex(null); setDetalheInput({ data: '', responsavel: '', horarioGravacao: '', horarioSaida: '', servico: '', notasServico: '', quantidadeDiarias: 1, produtoId: '', valorUnitarioBaseLegado: 0 })}}>Cancelar edição</button>
                  )}
                  <button type="button" className="btn-primary" onClick={addOrUpdateDetalhe}>
                    <Plus size={16}/> {editDetalheIndex !== null ? 'Atualizar Detalhe' : 'Adicionar Detalhe'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* SEÇÃO 3: Responsáveis */}
          <section className="card form-section">
            <h3 className="section-title"><span className="step-num">3</span> Responsáveis e Pagamentos</h3>
            {Object.keys(despesasResponsaveis).length === 0 ? (
              <p className="text-muted" style={{padding: '20px 0'}}>Adicione detalhes acima para incluir responsáveis.</p>
            ) : (
              <div className="resp-tabs-container">
                <div className="resp-tabs">
                  {Object.keys(despesasResponsaveis).map(nome => {
                    const st = despesasResponsaveis[nome].statusPagamento;
                    const dotClass = st === 'Pago' ? 'green' : (st === 'Não se aplica' ? 'gray' : 'red');
                    return (
                      <button key={nome} type="button" className={`resp-tab ${activeRespTab === nome ? 'active' : ''}`} onClick={() => setActiveRespTab(nome)}>
                        {nome}
                        <span className={`status-dot ${dotClass}`}></span>
                      </button>
                    );
                  })}
                </div>
                
                {activeRespTab && (
                  <div className="resp-content">
                    <div className="grid-4 mb-15">
                      <div className="input-group"><label>Freelance (R$)</label><input type="number" step="any" name="valorFreelance" value={respData.valorFreelance} onChange={handleRespInput} disabled={isViewMode}/></div>
                      <div className="input-group"><label>Condução (R$)</label><input type="number" step="any" name="reembolsoConducao" value={respData.reembolsoConducao} onChange={handleRespInput} disabled={isViewMode}/></div>
                      <div className="input-group"><label>Alimentação (R$)</label><input type="number" step="any" name="reembolsoAlimentacao" value={respData.reembolsoAlimentacao} onChange={handleRespInput} disabled={isViewMode}/></div>
                      <div className="input-group"><label>Hospedagem (R$)</label><input type="number" step="any" name="reembolsoHospedagem" value={respData.reembolsoHospedagem} onChange={handleRespInput} disabled={isViewMode}/></div>
                    </div>
                    <div className="grid-3">
                      <div className="input-group"><label>Agendamento</label><input type="date" name="agendamento" value={respData.agendamento} onChange={handleRespInput} disabled={isViewMode}/></div>
                      <div className="input-group">
                        <label>Status do Pagamento</label>
                        <select 
                          name="statusPagamento" 
                          value={respData.statusPagamento} 
                          onChange={handleRespInput} 
                          className={respData.statusPagamento === 'Pago' ? 'text-success' : (respData.statusPagamento === 'Pendente' ? 'text-danger' : '')} 
                          disabled={isViewMode}
                        >
                          <option value="">Selecione...</option>
                          <option value="Pendente">Pendente</option>
                          <option value="Pago">Pago</option>
                          <option value="Não se aplica">Não se aplica</option>
                        </select>
                      </div>
                      <div className="input-group"><label>Data do Pagamento</label><input type="date" name="dataPagamento" value={respData.dataPagamento} onChange={handleRespInput} disabled={isViewMode}/></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* SEÇÃO 4: NF e Faturamento */}
          <section className="card form-section mb-60">
            <h3 className="section-title"><span className="step-num">4</span> Faturamento</h3>
            <div className="grid-3">
              <div className="input-group"><label>NFS-e</label><input type="text" name="nfsE" value={formData.nfsE} onChange={handleInput} disabled={isViewMode}/></div>
              <div className="input-group">
                <label>Lançado no Conta Azul?</label>
                <div className="segmented-control">
                  <button type="button" className={formData.statusContaAzul === 'Pendente' ? 'active warning' : ''} onClick={() => !isViewMode && setFormData({...formData, statusContaAzul: 'Pendente'})} style={{cursor: isViewMode ? 'default' : 'pointer'}}>Pendente</button>
                  <button type="button" className={formData.statusContaAzul === 'Concluído' ? 'active success' : ''} onClick={() => !isViewMode && setFormData({...formData, statusContaAzul: 'Concluído'})} style={{cursor: isViewMode ? 'default' : 'pointer'}}>Concluído</button>
                </div>
              </div>
            </div>
          </section>
        </form>
      </div>

      <div className="os-form-sidebar">
        <div className="card fixed-summary">
          <h3>Resumo Financeiro</h3>
          
          <div className="summary-list">
            <div className="summary-item"><span className="text-muted">Faturamento</span><span className="fw-bold">R$ {financeiro.faturamento.toFixed(2).replace('.',',')}</span></div>
            <div className="summary-item"><span className="text-muted">Despesas Resp.</span><span>- R$ {financeiro.custoResponsaveis.toFixed(2).replace('.',',')}</span></div>
            <div className="summary-item"><span className="text-muted">Imposto (ISS)</span><span>- R$ {financeiro.iss.toFixed(2).replace('.',',')}</span></div>
            
            <div className="summary-divider"></div>
            
            <div className={`summary-total ${financeiro.lucro >= 0 ? 'positive' : 'negative'}`}>
              <span>Lucro Previsto</span>
              <span style={{fontSize:'22px', fontWeight:'bold'}}>R$ {financeiro.lucro.toFixed(2).replace('.',',')}</span>
            </div>
            
            <div className="summary-item mt-10" style={{alignItems:'center'}}>
              <span className="text-muted">Margem de Lucro</span>
              <span className={`badge ${financeiro.margem >= 20 ? 'success' : (financeiro.margem > 0 ? 'warning' : 'danger')}`}>{financeiro.margem.toFixed(1)}%</span>
            </div>
          </div>

          {!isViewMode && (
            <div className="form-actions mt-30">
              <button form="osform" type="submit" className="btn-primary" style={{width: '100%', padding: '14px', fontSize: '15px'}} disabled={isSaving}>
                <Save size={20}/> {isSaving ? 'Salvando...' : 'Salvar Ordem de Serviço'}
              </button>
            </div>
          )}
          {isViewMode && (
            <div className="form-actions mt-30">
              <button type="button" className="btn-outline" style={{width: '100%', padding: '14px', fontSize: '15px'}} onClick={() => navigate('/lista-os')}>
                <ArrowLeft size={20}/> Voltar para Lista
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* DOCUMENTO OFICIAL A4 PARA EXPORTAÇÃO EM PDF / IMPRESSÃO */}
      <div id="printable-os">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0084ff', paddingBottom: 15, marginBottom: 20 }}>
          <div>
            <img src={sebraeLogo} alt="Sebrae" style={{ height: 45, marginBottom: 5 }} />
            <div style={{ fontSize: 13, color: '#4b5563' }}>Gestão de Ordens de Serviço & Produção Audiovisual</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h1 style={{ margin: 0, fontSize: 24, color: '#0084ff' }}>ORDEM DE SERVIÇO</h1>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#111827' }}>Nº {formData.numeroOS || '---'}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              Emitida em: {new Date().toLocaleDateString('pt-BR')}
            </div>
          </div>
        </div>

        {/* Informações Gerais */}
        <div style={{ background: '#f8fafc', padding: 15, borderRadius: 6, marginBottom: 20, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 13 }}>
            <div><strong>Lote:</strong> {lotes[formData.lote]?.nome || formData.lote || '-'}</div>
            <div><strong>Nome da OS:</strong> {formData.nomeOS || '-'}</div>
            <div><strong>Cidade:</strong> {formData.cidade || 'Não informada'}</div>
            <div><strong>NFS-e:</strong> {formData.nfsE || 'Não preenchida'}</div>
            <div><strong>Conta Azul:</strong> {formData.statusContaAzul || 'Pendente'}</div>
          </div>
          {formData.adicionais && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#4b5563' }}>
              <strong>Adicionais:</strong> {formData.adicionais}
            </div>
          )}
        </div>

        {/* Tabela de Detalhes de Serviços */}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: '#1e293b', borderBottom: '1px solid #cbd5e1', paddingBottom: 5, marginBottom: 10 }}>
            1. Detalhamento dos Serviços Executados
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Data</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Dia</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Responsável</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Serviço / Produto</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Entrada</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Saída</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Qtd</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {detalhes.length > 0 ? detalhes.map((d, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '6px 8px' }}>{d.data ? d.data.split('-').reverse().join('/') : '-'}</td>
                  <td style={{ padding: '6px 8px' }}>{getDayOfWeek(d.data)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{d.responsavel}</td>
                  <td style={{ padding: '6px 8px' }}>{d.servico}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{d.horarioGravacao || '-'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{d.horarioSaida || '-'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{d.quantidadeDiarias}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                    R$ {Number(d.valorUnitario || 0).toFixed(2).replace('.', ',')}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="8" style={{ padding: 10, textAlign: 'center', color: '#6b7280' }}>Nenhum serviço registrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Tabela de Responsáveis e Pagamentos */}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: '#1e293b', borderBottom: '1px solid #cbd5e1', paddingBottom: 5, marginBottom: 10 }}>
            2. Equipe e Custos de Despesas
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Nome</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Freelance</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Condução</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Alimentação</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Hospedagem</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total Despesas</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Agendamento</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(despesasResponsaveis).length > 0 ? Object.entries(despesasResponsaveis).map(([nome, r], idx) => {
                const subTotal = (Number(r.valorFreelance) || 0) + (Number(r.reembolsoConducao) || 0) + 
                                 (Number(r.reembolsoAlimentacao) || 0) + (Number(r.reembolsoHospedagem) || 0);
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 'bold' }}>{nome}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>R$ {(Number(r.valorFreelance) || 0).toFixed(2).replace('.', ',')}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>R$ {(Number(r.reembolsoConducao) || 0).toFixed(2).replace('.', ',')}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>R$ {(Number(r.reembolsoAlimentacao) || 0).toFixed(2).replace('.', ',')}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>R$ {(Number(r.reembolsoHospedagem) || 0).toFixed(2).replace('.', ',')}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>R$ {subTotal.toFixed(2).replace('.', ',')}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.agendamento ? r.agendamento.split('-').reverse().join('/') : '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.statusPagamento || 'Pendente'}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="8" style={{ padding: 10, textAlign: 'center', color: '#6b7280' }}>Nenhum custo de equipe registrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Resumo Financeiro da OS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 25 }}>
          <div>
            <h4 style={{ fontSize: 13, textTransform: 'uppercase', margin: '0 0 8px 0', color: '#1e293b' }}>Observações & Briefing</h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 4, padding: 10, fontSize: 11, minHeight: 70, color: '#4b5563', background: '#fafafa' }}>
              {formData.observacoes || 'Nenhuma observação informada.'}
            </div>
          </div>

          <div style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: 12, background: '#f8fafc' }}>
            <h4 style={{ fontSize: 13, textTransform: 'uppercase', margin: '0 0 10px 0', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
              Demonstrativo Financeiro
            </h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>Faturamento Total:</span>
              <strong>R$ {financeiro.faturamento.toFixed(2).replace('.', ',')}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: '#dc2626' }}>
              <span>(-) Despesas da Equipe:</span>
              <span>- R$ {financeiro.custoResponsaveis.toFixed(2).replace('.', ',')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#dc2626' }}>
              <span>(-) Impostos (ISS {(aliquotaISS * 100).toFixed(2)}%):</span>
              <span>- R$ {financeiro.iss.toFixed(2).replace('.', ',')}</span>
            </div>
            <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 'bold', color: '#166534' }}>
              <span>Lucro Líquido Previsto:</span>
              <span>R$ {financeiro.lucro.toFixed(2).replace('.', ',')} ({financeiro.margem.toFixed(1)}%)</span>
            </div>
          </div>
        </div>

        {/* Assinaturas */}
        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, textAlign: 'center', fontSize: 12 }}>
          <div>
            <div style={{ borderBottom: '1px solid #000', marginBottom: 5 }}></div>
            <div>Responsável / Coordenação</div>
          </div>
          <div>
            <div style={{ borderBottom: '1px solid #000', marginBottom: 5 }}></div>
            <div>Aprovação Financeira / SEBRAE</div>
          </div>
        </div>
      </div>
    </>
  );
};
export default OSForm;
