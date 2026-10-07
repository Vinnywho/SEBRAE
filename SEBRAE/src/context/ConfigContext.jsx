import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabase';

const ConfigContext = createContext({});

export const ConfigProvider = ({ children }) => {
  const [lotes, setLotes] = useState({});
  const [aliquotaISS, setAliquotaISS] = useState(0.1633);
  const [diasEdicaoRecente, setDiasEdicaoRecente] = useState(5);
  const [loading, setLoading] = useState(true);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data: dataLotes, error: errLotes } = await supabase
        .from('lotes')
        .select('*')
        .order('ordem');
      
      if (!errLotes && dataLotes && dataLotes.length > 0) {
        const lotesMap = {};
        dataLotes.forEach(l => {
          lotesMap[l.codigo] = {
            codigo: l.codigo,
            nome: l.nome,
            ativo: l.ativo,
            produtos: l.produtos || []
          };
        });
        setLotes(lotesMap);
      }

      const { data: dataConf, error: errConf } = await supabase
        .from('configuracoes')
        .select('*');

      if (!errConf && dataConf) {
        dataConf.forEach(c => {
          if (c.chave === 'aliquota_iss') setAliquotaISS(Number(c.valor));
          if (c.chave === 'dias_edicao_recente') setDiasEdicaoRecente(Number(c.valor));
        });
      }
    } catch (error) {
      console.error("Erro ao carregar configurações.", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <ConfigContext.Provider value={{ lotes, aliquotaISS, diasEdicaoRecente, reloadConfig: loadConfig, loading }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => useContext(ConfigContext);
