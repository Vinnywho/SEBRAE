import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import edit from '../../assets/icons/edit.svg';
import delet from '../../assets/icons/delet.svg';
import './ListaOS.css';

const ListaOS = () => {
  const [osList, setOsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOS = async () => {
      try {
        const { data, error } = await supabase
          .from('ordens_servico')
          .select('*, os_detalhes(*), os_responsaveis(*)');

        if (error) throw error;
        setOsList(data || []);
      } catch (error) {
        console.error("Erro ao buscar as Ordens de Serviço:", error);
        alert("Erro ao carregar os dados.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOS();
  }, []);

  const handleEdit = (numero_os) => {
    navigate(`/os-form?id=${numero_os}`);
  };

  const handleDelete = async (numero_os) => {
    const confirmar = window.confirm(`Tem certeza que deseja excluir a OS ${numero_os}? Isso apagará todos os detalhes vinculados.`);
    if (!confirmar) return;

    try {
      const { error } = await supabase
        .from('ordens_servico')
        .delete()
        .eq('numero_os', numero_os);

      if (error) throw error;
      setOsList(osList.filter(os => os.numero_os !== numero_os));
    } catch (error) {
      console.error("Erro ao excluir OS:", error);
      alert("Erro ao excluir. Tente novamente.");
    }
  };

  const filteredList = osList.filter(os => {
    if (!startDate && !endDate) return true;
    if (!os.os_detalhes || os.os_detalhes.length === 0) return false;

    return os.os_detalhes.some(detalhe => {
      const dataServico = detalhe.data_servico;
      if (!dataServico) return false;

      let isValid = true;
      if (startDate && dataServico < startDate) isValid = false;
      if (endDate && dataServico > endDate) isValid = false;
      
      return isValid;
    });
  });

  const handleExportCSV = () => {
    if (filteredList.length === 0) return;

    const headers = [
      "Número da OS", "Lote", "Endereço", "Adicionais", "Observações",
      "Valor unitário total", "Custo responsável", "NFS-e", "Valor ISS", "Valor HL", "Lucro previsto",
      "Detalhe - Nome do Responsável", "Detalhe - Serviço", "Detalhe - Data", 
      "Detalhe - Horário Gravação", "Detalhe - Horário Saída", "Detalhe - Data de Pagamento", "Detalhe - Valor Unitário"
    ];

    const formatCell = (val, isNumeric = false) => {
      if (val === null || val === undefined || val === '') return '""';
      
      let formattedVal = String(val);
      
      if (isNumeric) {
        // Trava os decimais gerados na precisão em duas casas e troca o ponto pela vírgula
        formattedVal = Number(val).toFixed(2).replace('.', ',');
      } else if (/^\d+$/.test(formattedVal) && formattedVal.length > 10) {
        // Evita que o Excel converta "Números da OS" muito longos em notação científica (ex: 2E+15)
        return `="${formattedVal}"`;
      }
      
      return `"${formattedVal.replace(/"/g, '""')}"`;
    };

    let csvRows = [];
    csvRows.push(headers.join(";"));

    filteredList.forEach(os => {
      const baseData = [
        formatCell(os.numero_os), 
        formatCell(os.lote), 
        formatCell(os.endereco), 
        formatCell(os.adicionais), 
        formatCell(os.observacoes),
        formatCell(os.valor_unitario_total, true),
        formatCell(os.curso_responsavel, true), 
        formatCell(os.nfs_e), 
        formatCell(os.valor_iss, true), 
        formatCell(os.valor_hl, true), 
        formatCell(os.lucro_previsto, true)
      ];

      if (os.os_detalhes && os.os_detalhes.length > 0) {
        os.os_detalhes.forEach(detalhe => {
          
          let dataPagamento = '';
          if (os.os_responsaveis) {
            const responsavelEncontrado = os.os_responsaveis.find(r => r.nome === detalhe.responsavel_servico);
            if (responsavelEncontrado && responsavelEncontrado.data_pagamento) {
              dataPagamento = responsavelEncontrado.data_pagamento;
            }
          }

          const detalheData = [
            formatCell(detalhe.responsavel_servico),
            formatCell(detalhe.servico),
            formatCell(detalhe.data_servico),
            formatCell(detalhe.horario_gravacao),
            formatCell(detalhe.horario_saida),
            formatCell(dataPagamento),
            formatCell(detalhe.valor_unitario, true)
          ];
          
          csvRows.push([...baseData, ...detalheData].join(";"));
        });
      } else {
        csvRows.push([...baseData, '""', '""', '""', '""', '""', '""', '""'].join(";"));
      }
    });

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "lista_ordens_servico.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="lista-os-container">
      <div className="lista-os-header">
        <h2>Ordens de Serviço Cadastradas</h2>
        
        <div className="header-actions">
          <div className="date-filter">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Data inicial" />
            <span>até</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} title="Data final" />
          </div>
          
          <button onClick={handleExportCSV} className="btn-export">Exportar CSV</button>
          <button onClick={() => navigate('/os-form')} className="btn-new-os">+ Nova OS</button>
        </div>
      </div>

      <div className="table-wrapper">
        {isLoading ? (
          <p className="loading-text">Carregando ordens de serviço...</p>
        ) : (
          <table className="os-table">
            <thead>
              <tr>
                <th>Número da OS</th>
                <th>Lote</th>
                <th>Custo Responsável</th>
                <th>Lucro Previsto</th>
                <th className="action-column">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">Nenhuma Ordem de Serviço encontrada.</td>
                </tr>
              ) : (
                filteredList.map((os) => (
                  <tr key={os.numero_os}>
                    <td className="fw-bold">{os.numero_os}</td>
                    <td id="lote">{os.lote}</td>
                    <td>R$ {Number(os.curso_responsavel || 0).toFixed(2).replace('.', ',')}</td>
                    <td>R$ {Number(os.lucro_previsto || 0).toFixed(2).replace('.', ',')}</td>
                    <td className="action-column">
                      <button className="btn-icon edit" onClick={() => handleEdit(os.numero_os)}><img src={edit} alt="Editar" /></button>
                      <button className="btn-icon delete" onClick={() => handleDelete(os.numero_os)}><img src={delet} alt="Excluir" /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ListaOS;