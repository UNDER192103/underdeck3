export interface WebPage {
  id: string;
  name: string;
  icon: string | null;
  url: string;
  createdAt: number;
  updatedAt: number;
}

export interface WebPagesSettings {
  useAdblock: boolean;
  blockNewWindows: boolean;
}
