import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { useI18n } from '@/contexts/I18nContext';

export interface Attachment {
  name: string;
  attachment: string;
}

const ATTACHMENTS_STORAGE_KEY = 'discord-builder-attachments';

const getMimeTypeExtension = (mimeType: string): string | undefined => {
  const mimeMap: { [key: string]: string } = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  };
  return mimeMap[mimeType];
};

const getAttachmentInfo = async (
  attachmentUrl: string,
  t: (key: string, fallback?: string) => string
): Promise<{ contentType: string; contentLength: string; filename?: string } | null> => {
  try {
    const response = await axios.head(attachmentUrl);
    const contentType = response.headers['content-type'];
    const contentLength = response.headers['content-length'];
    const contentDisposition = response.headers['content-disposition'];

    let filename;
    if (contentDisposition) {
      const filenameMatch = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }

    if (!contentType) return null;
    return { contentType, contentLength, filename };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 405) {
      toast.warning(t('attachments.head_not_supported', 'O servidor não suporta verificação HEAD. A validação do anexo sera limitada.'));
    }
    console.error('Failed to fetch attachment info:', error);
    return null;
  }
};

export const useAttachments = () => {
  const { t } = useI18n();
  const [attachments, setAttachments] = useState<Attachment[]>(() => {
    try {
      const savedAttachments = localStorage.getItem(ATTACHMENTS_STORAGE_KEY);
      return savedAttachments ? JSON.parse(savedAttachments) : [];
    } catch (error) {
      console.error('Failed to load attachments from localStorage:', error);
      return [];
    }
  });

  const loadAttachments = useCallback(() => {
    try {
      const savedAttachments = localStorage.getItem(ATTACHMENTS_STORAGE_KEY);
      setAttachments(savedAttachments ? JSON.parse(savedAttachments) : []);
    } catch (error) {
      console.error('Failed to load attachments from localStorage:', error);
      setAttachments([]);
    }
  }, []);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  const saveAttachments = (newAttachments: Attachment[]) => {
    try {
      localStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify(newAttachments));
      setAttachments(newAttachments);
    } catch (error) {
      console.error('Failed to save attachments to localStorage:', error);
    }
  };

  const addAttachment = useCallback(async (newAttachment: Attachment): Promise<boolean> => {
    if (!newAttachment.attachment || !newAttachment.attachment.startsWith('http')) {
      toast.error(t('attachments.invalid_url', 'URL do anexo invalida.'));
      return false;
    }

    const attachmentInfo = await getAttachmentInfo(newAttachment.attachment, t);
    // Se a requisição HEAD falhar, mas tivermos um nome, podemos prosseguir com validação limitada
    if (!attachmentInfo) {
      if (!newAttachment.name) {
        toast.error(t('attachments.verify_without_name', 'Não foi possivel verificar a URL e nenhum nome foi fornecido. Por favor, nomeie o anexo.'));
        return false;
      }
      // Validação limitada: assume que a extensão no nome está correta
      const newAttachments = [...attachments, newAttachment];
      saveAttachments(newAttachments);
      toast.success(t('attachments.added_limited', `Anexo "${newAttachment.name}" adicionado (validação limitada).`));
      return true;
    }

    if (!attachmentInfo.contentType) {
      toast.error(t('attachments.verify_failed', 'Não foi possivel verificar a URL do anexo. Verifique se a URL esta correta e acessivel.'));
      return false;
    }

    // Prioridade do nome: 1. Nome do cabeçalho, 2. Nome da URL, 3. Nome fornecido pelo usuário
    const baseName = attachmentInfo.filename || new URL(newAttachment.attachment).pathname.split('/').pop() || newAttachment.name;

    const { contentType } = attachmentInfo;
    const extension = getMimeTypeExtension(contentType);

    if (!extension) {
      toast.error(t('attachments.unsupported_type', `Tipo de arquivo não suportado: ${contentType}`));
      return false;
    }

    if (!baseName) {
      toast.error(t('attachments.name_required', 'O anexo não pode ser nomeado automaticamente. Por favor, forneca um nome.'));
      return false;
    }

    let finalName = baseName;
    if (!finalName.endsWith(`.${extension}`)) {
      const nameWithoutExtension = finalName.includes('.') ? finalName.substring(0, finalName.lastIndexOf('.')) : finalName;
      finalName = `${nameWithoutExtension}.${extension}`;
      toast.info(t('attachments.name_adjusted', `O nome do arquivo foi ajustado para "${finalName}" para corresponder ao tipo de arquivo.`));
    }

    if (attachments.some(att => att.name === finalName)) {
      toast.error(t('attachments.duplicate_name', `Um anexo com o nome "${finalName}" ja existe.`));
      return false;
    }

    const newAttachments = [...attachments, { ...newAttachment, name: finalName }];
    saveAttachments(newAttachments);
    toast.success(t('attachments.added', `Anexo "${finalName}" adicionado.`));
    return true;
  }, [attachments, saveAttachments, t]);

  const removeAttachment = useCallback((attachment: Attachment) => {
    const newAttachments = attachments.filter(att => att !== attachment);
    saveAttachments(newAttachments);
  }, [attachments, saveAttachments]);

  return {
    attachments,
    addAttachment,
    removeAttachment,
    refreshAttachments: loadAttachments, // Expose loadAttachments as refreshAttachments
  };
};
