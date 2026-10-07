export const formatBRL = (value) => {
  if (value === null || value === undefined || value === '') return 'R$ 0,00';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
};

export const formatDateTime = (isoString) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('pt-BR', { 
    day: '2-digit', month: '2-digit', year: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
};

export const todayLocalISO = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(date.getTime() - offset)).toISOString().split('T')[0];
  return localISOTime;
};

export const isRecentlyEdited = (updatedAt, diasJanela = 5) => {
  if (!updatedAt) return false;
  const updateDate = new Date(updatedAt);
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() - diasJanela);
  return updateDate >= limitDate;
};

export const getDayOfWeek = (dateStr) => {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return days[date.getDay()];
};
