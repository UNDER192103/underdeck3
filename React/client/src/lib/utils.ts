import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import axios from 'axios';
import { toast } from 'sonner';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleCommandError(error: any, commandOrContext: string) {
  let errorMessage = `Falha ao executar a ação: '${commandOrContext}'.`;
  if (axios.isAxiosError(error) && error.response?.data) {
      const { data } = error.response;
      if (data.PermissionDeniedError && data.message) {
          errorMessage = data.message;
      } else if (data.error) {
          errorMessage = data.error;
      } else if (data.message) {
        errorMessage = data.message;
      }
  }
  toast.error(errorMessage);
  console.error(`Falha na ação '${commandOrContext}':`, error);
}