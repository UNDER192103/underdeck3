export interface AppCategory {
  id: string;
  name: string;
  icon: string | null;
  apps: string[];
  timestamp: number;
}
