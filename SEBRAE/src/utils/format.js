export const parseMonetary = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    let clean = value.replace(/[R$\s]/g, '').trim();
    if (clean.includes(',') && clean.includes('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    }
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

export const formatBRL = (value) => {
  const num = parseMonetary(value);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num).replace(/\s+/g, ' ');
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
