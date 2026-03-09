import { ptBRMessages } from "@/i18n/locales/pt-BR";
import { enUSMessages } from "@/i18n/locales/en-US";

export type TranslationMessages = Record<string, string>;

export interface BuiltinLocale {
  locale: string;
  name: string;
  messages: TranslationMessages;
}

export const builtinLocales: BuiltinLocale[] = [
  {
    locale: "pt-BR",
    name: "Português (Brasil)",
    messages: ptBRMessages,
  },
  {
    locale: "en-US",
    name: "English (US)",
    messages: enUSMessages,
  },
];

export const builtinByLocale = new Map(builtinLocales.map((item) => [item.locale, item]));
