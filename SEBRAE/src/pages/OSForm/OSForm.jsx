import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabase';
import edit from '../../assets/icons/edit.svg';
import delet from '../../assets/icons/delet.svg';
import './OSForm.css';

const VALORES_POR_LOTE = {
  lote2: [611.04, 297.09], lote5: [841.04, 683.35], lote7: [737.46, 368.73],
  lote8: [623.07, 316.05], lote10: [747.99, 316.05], lote11: [632.11, 204.38]
};

const OSForm = () => {
  const [searchParams] = useSearchParams();
  const osEditId = searchParams.get('id');

  const [formData, setFormData] = useState({
    numeroOS: '', lote: '', endereco: '', adicionais: '', observacoes: '',
    valorUnitarioTotal: '', cursoResponsavel: '', nfsE: '', valorISS: '', valorHL: '', lucroPrevisto: ''
  });

  const [detalheInput, setDetalheInput] = useState({
    data: '', responsavel: '', horarioGravacao: '', horarioSaida: '', servico: '', meiaDiaria: ''
  });
  
  const [detalhes, setDetalhes] = useState([]);
  const [valorDetalheAtual, setValorDetalheAtual] = useState('');
  
  const [editDetalheIndex, setEditDetalheIndex] = useState(null);
  
  const [despesasResponsaveis, setDespesasResponsaveis] = useState({});
  const [responsavelSelecionado, setResponsavelSelecionado] = useState('');

  useEffect(() => {
    if (osEditId) {
      const fetchOSData = async () => {
        try {
          const { data: osData, error: osError } = await supabase
            .from('ordens_servico')
            .select('*')
            .eq('numero_os', osEditId)
            .single();
          if (osError) throw osError;

          const { data: detalhesData, error: detalhesError } = await supabase
            .from('os_detalhes')
            .select('*')
            .eq('numero_os', osEditId);
          if (detalhesError) throw detalhesError;

          const { data: respData, error: respError } = await supabase
            .from('os_responsaveis')
            .select('*')
            .eq('numero_os', osEditId);
          if (respError) throw respError;

          setFormData({
            numeroOS: osData.numero_os, lote: osData.lote || '', endereco: osData.endereco || '',
            adicionais: osData.adicionais || '', observacoes: osData.observacoes || '',
            valorUnitarioTotal: osData.valor_unitario_total || '', cursoResponsavel: osData.curso_responsavel || '',
            nfsE: osData.nfs_e || '', valorISS: osData.valor_iss || '', valorHL: osData.valor_hl || '',
            lucroPrevisto: osData.lucro_previsto || ''
          });

          const mappedDetalhes = detalhesData.map(d => ({
            data: d.data_servico || '', responsavel: d.responsavel_servico || '',
            horarioGravacao: d.horario_gravacao || '', horarioSaida: d.horario_saida || '',
            servico: d.servico || '', meiaDiaria: d.meia_diaria || '', valorUnitario: d.valor_unitario
          }));
          setDetalhes(mappedDetalhes);

          const respDict = {};
          respData.forEach(r => {
            respDict[r.nome] = {
              valorFreelance: r.valor_freelance || '', reembolsoConducao: r.reembolso_conducao || '',
              reembolsoAlimentacao: r.reembolso_alimentacao || '', reembolsoHospedagem: r.reembolso_hospedagem || '',
              agendamento: r.agendamento || '', statusPagamento: r.status_pagamento || '', dataPagamento: r.data_pagamento || ''
            };
          });
          setDespesasResponsaveis(respDict);

        } catch (error) {
          console.error("Erro ao carregar OS para edição:", error);
          alert("Não foi possível carregar os dados desta OS.");
        }
      };
      fetchOSData();
    }
  }, [osEditId]);

  useEffect(() => {
    const somaTotal = detalhes.reduce((acc, detalhe) => acc + Number(detalhe.valorUnitario), 0);
    setFormData(prev => ({ ...prev, valorUnitarioTotal: somaTotal }));
  }, [detalhes]);

  useEffect(() => {
    const issCalculado = Number(formData.valorUnitarioTotal) * 0.1633;
    setFormData(prev => ({ ...prev, valorISS: issCalculado }));
  }, [formData.valorUnitarioTotal]);

  useEffect(() => {
    let custoTotal = 0;
    Object.values(despesasResponsaveis).forEach(resp => {
      custoTotal += (Number(resp.valorFreelance) || 0) + (Number(resp.reembolsoConducao) || 0) +
                    (Number(resp.reembolsoAlimentacao) || 0) + (Number(resp.reembolsoHospedagem) || 0);
    });
    setFormData(prev => ({ ...prev, cursoResponsavel: custoTotal }));
  }, [despesasResponsaveis]);

  useEffect(() => {
    const despesas = Number(formData.cursoResponsavel) + Number(formData.valorISS) + Number(formData.valorHL);
    const lucro = Number(formData.valorUnitarioTotal) - despesas;
    setFormData(prev => ({ ...prev, lucroPrevisto: lucro }));
  }, [formData.cursoResponsavel, formData.valorISS, formData.valorHL, formData.valorUnitarioTotal]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (name === 'lote') setValorDetalheAtual('');
  };

  const handleDetalheInputChange = (e) => {
    const { name, value } = e.target;
    setDetalheInput({ ...detalheInput, [name]: value });
  };

  const handleDespesaResponsavelChange = (e) => {
    const { name, value } = e.target;
    if (!responsavelSelecionado) return;
    setDespesasResponsaveis(prev => ({
      ...prev,
      [responsavelSelecionado]: {
        ...prev[responsavelSelecionado],
        [name]: value
      }
    }));
  };

  // Funções de Ação dos Detalhes
  const handleEditDetalhe = (index) => {
    const det = detalhes[index];
    setDetalheInput({
      data: det.data || '',
      responsavel: det.responsavel || '',
      horarioGravacao: det.horarioGravacao || '',
      horarioSaida: det.horarioSaida || '',
      servico: det.servico || '',
      meiaDiaria: det.meiaDiaria || ''
    });
    setValorDetalheAtual(det.valorUnitario);
    setEditDetalheIndex(index);
  };

  const handleDeleteDetalhe = (index) => {
    setDetalhes(prev => prev.filter((_, i) => i !== index));
    if (editDetalheIndex === index) {
      setEditDetalheIndex(null);
      setDetalheInput({ data: '', responsavel: '', horarioGravacao: '', horarioSaida: '', servico: '', meiaDiaria: '' });
      setValorDetalheAtual('');
    }
  };

  const handleAddDetalhe = () => {
    if (!formData.lote || !valorDetalheAtual || !detalheInput.responsavel) {
      alert("Preencha o Lote, o Responsável no detalhe e selecione o Valor Unitário.");
      return;
    }

    const novoDetalhe = { ...detalheInput, valorUnitario: Number(valorDetalheAtual) };

    if (editDetalheIndex !== null) {
      // Atualiza o detalhe existente
      setDetalhes(prev => {
        const atualizados = [...prev];
        atualizados[editDetalheIndex] = novoDetalhe;
        return atualizados;
      });
      setEditDetalheIndex(null);
    } else {
      // Adiciona um detalhe novo
      setDetalhes(prev => [...prev, novoDetalhe]);
    }

    if (!despesasResponsaveis[detalheInput.responsavel]) {
      setDespesasResponsaveis(prev => ({
        ...prev,
        [detalheInput.responsavel]: {
          valorFreelance: '', reembolsoConducao: '', reembolsoAlimentacao: '', reembolsoHospedagem: '',
          agendamento: '', statusPagamento: '', dataPagamento: ''
        }
      }));
      if (!responsavelSelecionado) setResponsavelSelecionado(detalheInput.responsavel);
    }

    setDetalheInput({ data: '', responsavel: '', horarioGravacao: '', horarioSaida: '', servico: '', meiaDiaria: '' });
    setValorDetalheAtual(''); 
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.numeroOS) {
      alert("O 'Número da OS' é obrigatório.");
      return;
    }

    try {
      const osPayload = {
        numero_os: formData.numeroOS, lote: formData.lote, endereco: formData.endereco,
        adicionais: formData.adicionais, observacoes: formData.observacoes,
        valor_unitario_total: formData.valorUnitarioTotal || null, curso_responsavel: formData.cursoResponsavel || null,
        nfs_e: formData.nfsE, valor_iss: formData.valorISS || null, valor_hl: Number(formData.valorHL) || null,
        lucro_previsto: formData.lucroPrevisto || null
      };

      const { error: osError } = await supabase.from('ordens_servico').upsert([osPayload]);
      if (osError) throw osError;

      if (detalhes.length > 0) {
        const detalhesPayload = detalhes.map(det => ({
          numero_os: formData.numeroOS, valor_unitario: det.valorUnitario, data_servico: det.data || null,
          responsavel_servico: det.responsavel, horario_gravacao: det.horarioGravacao || null,
          horario_saida: det.horarioSaida || null, servico: det.servico, meia_diaria: det.meiaDiaria
        }));
        await supabase.from('os_detalhes').delete().eq('numero_os', formData.numeroOS); 
        const { error: detalhesError } = await supabase.from('os_detalhes').insert(detalhesPayload);
        if (detalhesError) throw detalhesError;
      }

      const responsaveisNomes = Object.keys(despesasResponsaveis);
      if (responsaveisNomes.length > 0) {
        const responsaveisPayload = responsaveisNomes.map(nome => {
          const resp = despesasResponsaveis[nome];
          return {
            numero_os: formData.numeroOS, nome: nome,
            valor_freelance: Number(resp.valorFreelance) || null, reembolso_conducao: Number(resp.reembolsoConducao) || null,
            reembolso_alimentacao: Number(resp.reembolsoAlimentacao) || null, reembolso_hospedagem: Number(resp.reembolsoHospedagem) || null,
            agendamento: resp.agendamento || null, status_pagamento: resp.statusPagamento, data_pagamento: resp.dataPagamento || null
          };
        });
        await supabase.from('os_responsaveis').delete().eq('numero_os', formData.numeroOS);
        const { error: respError } = await supabase.from('os_responsaveis').insert(responsaveisPayload);
        if (respError) throw respError;
      }

      alert("Ordem de serviço salva com sucesso!");
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar os dados.");
    }
  };

  const dadosResponsavelSelecionado = despesasResponsaveis[responsavelSelecionado] || {};

  return (
    <form className="os-form" onSubmit={handleSubmit}>
      <section>
        <h2>Ativos {osEditId && <span style={{fontSize: '12px', color: '#888', marginLeft: '10px'}}>(Modo de Edição)</span>}</h2>
        <div className="grid-3">
          <div className="input-block">
            <label>Número da OS</label>
            <input 
              type="text" 
              name="numeroOS" 
              value={formData.numeroOS} 
              onChange={handleInputChange} 
              readOnly={!!osEditId} 
              style={{ opacity: osEditId ? 0.7 : 1 }}
              title={osEditId ? "Não é possível alterar o número da OS durante a edição" : ""}
            />
          </div>
          <div className="input-block">
            <label>Lote</label>
            <select name="lote" value={formData.lote} onChange={handleInputChange}>
                <option value="" disabled>Selecione</option>
                <option value="lote2">Lote 2</option><option value="lote5">Lote 5</option>
                <option value="lote7">Lote 7</option><option value="lote8">Lote 8</option>
                <option value="lote10">Lote 10</option><option value="lote11">Lote 11</option>
            </select>
          </div>
          <div className="input-block"><label>Endereço da gravação</label><input type="text" name="endereco" value={formData.endereco} onChange={handleInputChange} /></div>
        </div>
        <div className="grid-2">
          <div className="input-block"><label>Adicionais</label><textarea name="adicionais" value={formData.adicionais} onChange={handleInputChange}></textarea></div>
          <div className="input-block"><label>Observações / Briefing</label><textarea name="observacoes" value={formData.observacoes} onChange={handleInputChange}></textarea></div>
        </div>
      </section>

      <section>
        <div className="section-header">
          <h2>Detalhes ({detalhes.length} adicionados) </h2>
        </div>
        
        <div className="details-header-row">
           <span>Data</span><span>Responsável</span><span>Horário gravação</span><span>Horário saída</span><span>Serviço</span><span>Meia diária</span><span>Valor unitário</span><span style={{textAlign: 'right'}}>Ações</span>
        </div>

        {detalhes.map((det, index) => (
          <div key={index} className="details-header-row" style={{ fontWeight: 'normal', borderBottom: '1px solid #f5f5f5', paddingBottom: '10px', marginBottom: '10px' }}>
             <span>{det.data || '-'}</span>
             <span>{det.responsavel}</span>
             <span>{det.horarioGravacao || '-'}</span>
             <span>{det.horarioSaida || '-'}</span>
             <span>{det.servico || '-'}</span>
             <span>{det.meiaDiaria || '-'}</span>
             <span>R$ {det.valorUnitario}</span>
             <span style={{textAlign: 'right'}}>
               <button type="button" onClick={() => handleEditDetalhe(index)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginRight: '10px', fontSize: '14px' }}><img src={edit} alt="Editar" /></button>
               <button type="button" onClick={() => handleDeleteDetalhe(index)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px' }}><img src={delet} alt="Excluir" /></button>
             </span>
          </div>
        ))}

        <div className="grid-4" style={{ marginTop: '30px' }}>
          <div className="input-block"><label>Data</label><input type="date" name="data" value={detalheInput.data} onChange={handleDetalheInputChange} /></div>
          <div className="input-block"><label>Horário gravação</label><input type="time" name="horarioGravacao" value={detalheInput.horarioGravacao} onChange={handleDetalheInputChange} /></div>
          <div className="input-block"><label>Horário Saída</label><input type="time" name="horarioSaida" value={detalheInput.horarioSaida} onChange={handleDetalheInputChange} /></div>
        </div>
        <div className="grid-2">
           <div className="input-block"><label>Responsável</label><input type="text" name="responsavel" value={detalheInput.responsavel} onChange={handleDetalheInputChange} placeholder="Nome do profissional" /></div>
           <div className="input-block"><label>Serviço</label><input type="text" name="servico" value={detalheInput.servico} onChange={handleDetalheInputChange} /></div>
        </div>
        <div className="grid-3 align-end">
           <div className="input-block"><label>Meia diária</label><input type="text" name="meiaDiaria" value={detalheInput.meiaDiaria} onChange={handleDetalheInputChange} /></div>
           <div className="input-block">
             <label>Valor Unitário</label>
             <select value={valorDetalheAtual} onChange={(e) => setValorDetalheAtual(e.target.value)} disabled={!formData.lote}>
               <option value="" disabled>{formData.lote ? "Selecione o valor" : "Selecione o Lote antes"}</option>
               {formData.lote && VALORES_POR_LOTE[formData.lote].map((valor, index) => (
                 <option key={index} value={valor}>R$ {valor}</option>
               ))}
             </select>
           </div>
           <button type="button" className="btn-blue" onClick={handleAddDetalhe}>
             {editDetalheIndex !== null ? "Atualizar detalhe" : "Adicionar detalhes"}
           </button>
        </div>
      </section>

      <section>
        <h2>Responsável</h2>
        <div className="input-block full-width">
          <select value={responsavelSelecionado} onChange={(e) => setResponsavelSelecionado(e.target.value)}>
            <option value="" disabled>Selecione um responsável adicionado...</option>
            {Object.keys(despesasResponsaveis).map((nome, i) => (
              <option key={i} value={nome}>{nome}</option>
            ))}
          </select>
        </div>
        <div className="grid-4">
          <div className="input-block"><label>Valor do freelance</label><input type="number" step="any" name="valorFreelance" value={dadosResponsavelSelecionado.valorFreelance || ''} onChange={handleDespesaResponsavelChange} disabled={!responsavelSelecionado} /></div>
          <div className="input-block"><label>Reembolso condução</label><input type="number" step="any" name="reembolsoConducao" value={dadosResponsavelSelecionado.reembolsoConducao || ''} onChange={handleDespesaResponsavelChange} disabled={!responsavelSelecionado} /></div>
          <div className="input-block"><label>Reembolso alimentação</label><input type="number" step="any" name="reembolsoAlimentacao" value={dadosResponsavelSelecionado.reembolsoAlimentacao || ''} onChange={handleDespesaResponsavelChange} disabled={!responsavelSelecionado} /></div>
          <div className="input-block"><label>Reembolso hospedagem</label><input type="number" step="any" name="reembolsoHospedagem" value={dadosResponsavelSelecionado.reembolsoHospedagem || ''} onChange={handleDespesaResponsavelChange} disabled={!responsavelSelecionado} /></div>
        </div>
        <div className="grid-3">
           <div className="input-block"><label>Agendamento</label><input type="date" name="agendamento" value={dadosResponsavelSelecionado.agendamento || ''} onChange={handleDespesaResponsavelChange} disabled={!responsavelSelecionado} /></div>
           <div className="input-block"><label>Status do pagamento</label><select className={`payment-status-select status-${(dadosResponsavelSelecionado.statusPagamento || 'empty').toLowerCase()}`} name="statusPagamento" value={dadosResponsavelSelecionado.statusPagamento || ''} onChange={handleDespesaResponsavelChange} disabled={!responsavelSelecionado}><option value="">Selecione</option><option value="Pago">Pago</option><option value="Pendente">Pendente</option></select></div>
           <div className="input-block"><label>Data do pagamento</label><input type="date" name="dataPagamento" value={dadosResponsavelSelecionado.dataPagamento || ''} onChange={handleDespesaResponsavelChange} disabled={!responsavelSelecionado} /></div>
        </div>
      </section>

      <section>
        <h2>Faturamentos aprovados</h2>
        <div className="grid-3">
          <div className="input-block"><label>Valor unitário total</label><input type="number" step="any" value={formData.valorUnitarioTotal} readOnly className="readonly-input" /></div>
          <div className="input-block"><label>Custo responsável</label><input type="number" step="any" value={formData.cursoResponsavel} readOnly className="readonly-input" /></div>
          <div className="input-block"><label>NFS-e</label><input type="text" name="nfsE" value={formData.nfsE} onChange={handleInputChange} /></div>
        </div>
      </section>

      <section>
        <h2>Informações de valores e Nota Fiscal</h2>
        <div className="grid-3">
          <div className="input-block"><label>Valor ISS (16,33%)</label><input type="number" step="any" value={formData.valorISS} readOnly className="readonly-input" /></div>
          <div className="input-block"><label>Valor HL</label><input type="number" step="any" name="valorHL" value={formData.valorHL} onChange={handleInputChange} /></div>
          <div className="input-block"><label>Lucro previsto</label><input type="number" step="any" value={formData.lucroPrevisto} readOnly className="readonly-input" /></div>
        </div>
      </section>

      <div className="form-actions">
        <button type="submit" className="btn-submit">{osEditId ? "Atualizar Ordem de Serviço" : "Salvar Ordem de Serviço"}</button>
      </div>
    </form>
  );
};

export default OSForm;