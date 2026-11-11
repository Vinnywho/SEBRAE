import React, { useState, useEffect } from 'react';
import { 
  Landmark, 
  CreditCard, 
  Copy, 
  CheckCircle, 
  X, 
  User, 
  Edit3, 
  Save, 
  Phone, 
  FileText,
  ShieldCheck,
  AlertCircle,
  Mail
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { 
  saveCadastroBancario, 
  formatDadosParaCopia, 
  BANCOS_COMUNS 
} from '../../services/bancarioService';
import './ModalDadosBancarios.css';

const DEFAULT_FORM_DATA = {
  nome: '',
  cpf_cnpj: '',
  rg: '',
  banco: '',
  agencia: '',
  conta: '',
  tipo_conta: 'Corrente',
  tipo_chave_pix: 'Chave Aleatória',
  chave_pix: '',
  titular: '',
  telefone: '',
  email: '',
  observacoes: ''
};

const ModalDadosBancarios = ({
  isOpen,
  onClose,
  responsavel = '',
  initialData = null,
  forceEdit = false,
  onSaveSuccess
}) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [isEditing, setIsEditing] = useState(forceEdit);
  const [copiedPix, setCopiedPix] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sincroniza dados ao abrir ou trocar responsável
  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setFormData({
        nome: initialData.nome || responsavel || '',
        cpf_cnpj: initialData.cpf_cnpj || '',
        rg: initialData.rg || '',
        banco: initialData.banco || '',
        agencia: initialData.agencia || '',
        conta: initialData.conta || '',
        tipo_conta: initialData.tipo_conta || 'Corrente',
        tipo_chave_pix: initialData.tipo_chave_pix || 'Chave Aleatória',
        chave_pix: initialData.chave_pix || '',
        titular: initialData.titular || initialData.nome || responsavel || '',
        telefone: initialData.telefone || '',
        email: initialData.email || '',
        observacoes: initialData.observacoes || ''
      });
      setIsEditing(forceEdit);
    } else {
      setFormData({
        ...DEFAULT_FORM_DATA,
        nome: responsavel || '',
        titular: responsavel || ''
      });
      setIsEditing(true); // Se não tem dados, entra direto em modo de edição
    }
  }, [isOpen, initialData, responsavel, forceEdit]);

  // Fechar com ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasAnyData = Boolean(
    initialData && (
      initialData.banco || 
      initialData.chave_pix || 
      initialData.conta || 
      initialData.cpf_cnpj || 
      initialData.rg || 
      initialData.email || 
      initialData.telefone
    )
  );

  const handleCopyPix = (chave) => {
    if (!chave) {
      toast.warning('Nenhuma chave PIX cadastrada para copiar.');
      return;
    }
    navigator.clipboard.writeText(chave);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2200);
    toast.success('Chave PIX copiada para a área de transferência!');
  };

  const handleCopyAll = () => {
    const text = formatDadosParaCopia(formData);
    if (!text) {
      toast.warning('Nenhum dado bancário disponível para copiar.');
      return;
    }
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2200);
    toast.success('Todos os dados bancários foram copiados!');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nome || !formData.nome.trim()) {
      toast.error('O nome do responsável é obrigatório.');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveCadastroBancario(formData);
      toast.success(`Dados bancários de ${formData.nome} salvos com sucesso!`);
      if (onSaveSuccess) {
        await onSaveSuccess(saved);
      }
      setIsEditing(false);
    } catch (err) {
      toast.error('Erro ao salvar dados bancários: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-banco-overlay" onClick={onClose}>
      <div 
        className="modal-banco-dialog" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* CABEÇALHO */}
        <div className="modal-banco-header">
          <div className="modal-banco-header-info">
            <div className="modal-banco-avatar-box">
              <Landmark size={22} color="#0084ff" />
            </div>
            <div>
              <h3 className="modal-banco-title">
                {isEditing 
                  ? (formData.nome ? `Editar Dados: ${formData.nome}` : 'Cadastrar Dados Bancários')
                  : 'Dados Bancários para Pagamento'}
              </h3>
              <div className="modal-banco-subtitle">
                <User size={13} />
                <span>{formData.nome || responsavel || 'Profissional / Responsável'}</span>
              </div>
            </div>
          </div>
          <button 
            type="button" 
            className="modal-banco-close-btn" 
            onClick={onClose} 
            title="Fechar (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* CORPO COM SCROLL GARANTIDO E MARGENS GENEROSAS */}
        <div className="modal-banco-body-scroll">
          {!isEditing && hasAnyData ? (
            /* ========================================================
               MODO VISUALIZAÇÃO / CONFERÊNCIA DE PAGAMENTO
               ======================================================== */
            <div className="modal-banco-view-container">
              {/* CARD DE DESTAQUE PIX */}
              <div className="banco-pix-hero-card">
                <div className="banco-pix-hero-header">
                  <div className="banco-pix-tag">
                    <span className="pix-indicator-pulse"></span>
                    <span>PIX • {formData.tipo_chave_pix || 'Chave'}</span>
                  </div>
                  {formData.chave_pix && (
                    <button
                      type="button"
                      className={`btn-pix-copy ${copiedPix ? 'copied' : ''}`}
                      onClick={() => handleCopyPix(formData.chave_pix)}
                    >
                      {copiedPix ? (
                        <>
                          <CheckCircle size={14} />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copiar PIX</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="banco-pix-key-val">
                  {formData.chave_pix || <span className="text-empty">(Chave PIX não informada)</span>}
                </div>
              </div>

              {/* CARD DE DETALHES BANCÁRIOS */}
              <div className="banco-details-card">
                <div className="banco-card-label-heading">
                  <CreditCard size={16} />
                  <span>Conta Bancária de Depósito</span>
                </div>

                <div className="banco-details-grid">
                  <div className="banco-detail-cell">
                    <span className="cell-label">Banco</span>
                    <span className="cell-value strong">{formData.banco || '-'}</span>
                  </div>
                  <div className="banco-detail-cell">
                    <span className="cell-label">Tipo de Conta</span>
                    <span className="cell-value">{formData.tipo_conta || 'Conta Corrente'}</span>
                  </div>
                  <div className="banco-detail-cell">
                    <span className="cell-label">Agência</span>
                    <span className="cell-value strong">{formData.agencia || '-'}</span>
                  </div>
                  <div className="banco-detail-cell">
                    <span className="cell-label">Conta com Dígito</span>
                    <span className="cell-value strong">{formData.conta || '-'}</span>
                  </div>
                  <div className="banco-detail-cell cell-full">
                    <span className="cell-label">Titular Favorecido</span>
                    <span className="cell-value">{formData.titular || formData.nome || '-'}</span>
                  </div>
                  {formData.cpf_cnpj && (
                    <div className="banco-detail-cell">
                      <span className="cell-label">CPF / CNPJ</span>
                      <span className="cell-value">{formData.cpf_cnpj}</span>
                    </div>
                  )}
                  {formData.rg && (
                    <div className="banco-detail-cell">
                      <span className="cell-label">RG</span>
                      <span className="cell-value">{formData.rg}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* OBSERVAÇÕES E CONTATO (SE HOUVER) */}
              {(formData.email || formData.telefone || formData.observacoes) && (
                <div className="banco-extra-info-card">
                  {formData.email && (
                    <div className="banco-extra-row">
                      <Mail size={15} className="extra-icon" />
                      <span><strong>E-mail:</strong> {formData.email}</span>
                    </div>
                  )}
                  {formData.telefone && (
                    <div className="banco-extra-row">
                      <Phone size={15} className="extra-icon" />
                      <span><strong>Contato:</strong> {formData.telefone}</span>
                    </div>
                  )}
                  {formData.observacoes && (
                    <div className="banco-extra-row">
                      <FileText size={15} className="extra-icon" />
                      <span><strong>Observações:</strong> {formData.observacoes}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ========================================================
               MODO FORMULÁRIO / EDIÇÃO COM ESPAÇAMENTO GENEROSO
               ======================================================== */
            <form id="modal-banco-form" onSubmit={handleSave} className="modal-banco-form">
              {/* SEÇÃO: DADOS PESSOAIS */}
              <div className="form-section-wrapper">
                <span className="form-section-caption">Identificação do Profissional</span>
                
                <div className="banco-form-group">
                  <label className="banco-field-label">Nome Completo *</label>
                  <input 
                    type="text" 
                    className="banco-field-input"
                    placeholder="Nome completo do responsável..."
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    required
                  />
                </div>

                <div className="banco-form-row-2">
                  <div className="banco-form-group">
                    <label className="banco-field-label">CPF ou CNPJ</label>
                    <input 
                      type="text" 
                      className="banco-field-input"
                      placeholder="000.000.000-00"
                      value={formData.cpf_cnpj}
                      onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
                    />
                  </div>
                  <div className="banco-form-group">
                    <label className="banco-field-label">RG</label>
                    <input 
                      type="text" 
                      className="banco-field-input"
                      placeholder="Ex: 12.345.678-9"
                      value={formData.rg}
                      onChange={(e) => setFormData({ ...formData, rg: e.target.value })}
                    />
                  </div>
                </div>

                <div className="banco-form-row-2">
                  <div className="banco-form-group">
                    <label className="banco-field-label">E-mail</label>
                    <input 
                      type="email" 
                      className="banco-field-input"
                      placeholder="exemplo@email.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="banco-form-group">
                    <label className="banco-field-label">Telefone / WhatsApp</label>
                    <input 
                      type="text" 
                      className="banco-field-input"
                      placeholder="(00) 00000-0000"
                      value={formData.telefone}
                      onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO: DADOS DA CONTA BANCÁRIA */}
              <div className="form-section-wrapper">
                <span className="form-section-caption">Dados da Instituição Bancária</span>

                <div className="banco-form-row-2">
                  <div className="banco-form-group">
                    <label className="banco-field-label">Instituição / Banco</label>
                    <input 
                      type="text" 
                      className="banco-field-input"
                      list="bancos-sugestoes-modal"
                      placeholder="Ex: Nubank, Banco do Brasil..."
                      value={formData.banco}
                      onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                    />
                    <datalist id="bancos-sugestoes-modal">
                      {BANCOS_COMUNS.map(b => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </div>

                  <div className="banco-form-group">
                    <label className="banco-field-label">Tipo de Conta</label>
                    <select 
                      className="banco-field-select"
                      value={formData.tipo_conta}
                      onChange={(e) => setFormData({ ...formData, tipo_conta: e.target.value })}
                    >
                      <option value="Corrente">Conta Corrente</option>
                      <option value="Poupança">Conta Poupança</option>
                      <option value="Pagamento">Conta Pagamento</option>
                    </select>
                  </div>
                </div>

                <div className="banco-form-row-2">
                  <div className="banco-form-group">
                    <label className="banco-field-label">Agência (com dígito)</label>
                    <input 
                      type="text" 
                      className="banco-field-input"
                      placeholder="Ex: 0001"
                      value={formData.agencia}
                      onChange={(e) => setFormData({ ...formData, agencia: e.target.value })}
                    />
                  </div>
                  <div className="banco-form-group">
                    <label className="banco-field-label">Número da Conta (com dígito)</label>
                    <input 
                      type="text" 
                      className="banco-field-input"
                      placeholder="Ex: 1234567-8"
                      value={formData.conta}
                      onChange={(e) => setFormData({ ...formData, conta: e.target.value })}
                    />
                  </div>
                </div>

                <div className="banco-form-group">
                  <label className="banco-field-label">Titular Favorecido (se diferente do responsável)</label>
                  <input 
                    type="text" 
                    className="banco-field-input"
                    placeholder="Nome completo do favorecido"
                    value={formData.titular}
                    onChange={(e) => setFormData({ ...formData, titular: e.target.value })}
                  />
                </div>
              </div>

              {/* SEÇÃO: CONFIGURAÇÃO PIX */}
              <div className="banco-pix-box-edit">
                <div className="banco-pix-box-header">
                  <ShieldCheck size={16} />
                  <span>Configuração da Chave PIX</span>
                </div>

                <div className="banco-form-row-2">
                  <div className="banco-form-group">
                    <label className="banco-field-label">Tipo da Chave</label>
                    <select 
                      className="banco-field-select"
                      value={formData.tipo_chave_pix}
                      onChange={(e) => setFormData({ ...formData, tipo_chave_pix: e.target.value })}
                    >
                      <option value="CPF/CNPJ">CPF / CNPJ</option>
                      <option value="Celular">Celular / WhatsApp</option>
                      <option value="E-mail">E-mail</option>
                      <option value="Chave Aleatória">Chave Aleatória</option>
                    </select>
                  </div>

                  <div className="banco-form-group">
                    <label className="banco-field-label">Chave PIX</label>
                    <input 
                      type="text" 
                      className="banco-field-input"
                      placeholder="Informe a chave PIX exata..."
                      value={formData.chave_pix}
                      onChange={(e) => setFormData({ ...formData, chave_pix: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* SEÇÃO: OBSERVAÇÕES */}
              <div className="form-section-wrapper">
                <div className="banco-form-group">
                  <label className="banco-field-label">Observações Adicionais para Pagamento</label>
                  <textarea 
                    rows="2"
                    className="banco-field-textarea"
                    placeholder="Ex: Chave PIX cadastrada como celular; não aceita TED."
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* RODAPÉ ELEGANTE E FIXO */}
        <div className="modal-banco-footer">
          {!isEditing && hasAnyData ? (
            <>
              <button 
                type="button" 
                className={`btn-banco-copy-all ${copiedAll ? 'copied' : ''}`}
                onClick={handleCopyAll}
              >
                {copiedAll ? <CheckCircle size={15} /> : <Copy size={15} />}
                <span>{copiedAll ? 'Dados Copiados!' : 'Copiar Todos os Dados'}</span>
              </button>

              <button 
                type="button" 
                className="btn-banco-edit-toggle"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 size={15} />
                <span>Editar Informações</span>
              </button>
            </>
          ) : (
            <>
              {hasAnyData && (
                <button 
                  type="button" 
                  className="btn-banco-cancel"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                >
                  Voltar à Visualização
                </button>
              )}
              {!hasAnyData && (
                <button 
                  type="button" 
                  className="btn-banco-cancel"
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
              )}

              <button 
                type="submit" 
                form="modal-banco-form"
                className="btn-banco-save-primary"
                disabled={isSaving}
              >
                <Save size={16} />
                <span>{isSaving ? 'Salvando Dados...' : 'Salvar Informações'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalDadosBancarios;
