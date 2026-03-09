export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface SelectFileOptions {
  title?: string;
  buttonLabel?: string;
  defaultPath?: string;
  filters?: FileDialogFilter[];
  includeDirectories?: boolean;
  allowMultiple?: boolean;
  showHiddenFiles?: boolean;
}

export interface SaveFileOptions {
  title?: string;
  buttonLabel?: string;
  defaultPath?: string;
  filters?: FileDialogFilter[];
  nameFieldLabel?: string;
  message?: string;
}
