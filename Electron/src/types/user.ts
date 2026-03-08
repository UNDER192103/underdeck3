export interface UserTag {
  name: string;
  icon?: string | null;
  description?: string;
  meta_data?: any;
}

export interface AppUser {
  id: string;
  displayName: string;
  username: string;
  email: string;
  description: string;
  profileNote: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  profileBannerColor: string;
  premium: boolean;
  profileGradientTop: string;
  profileGradientBottom: string;
  tags: UserTag[];
  sessionId?: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface RegisterPayload {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}
