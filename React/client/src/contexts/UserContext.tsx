import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { AppUser, LoginPayload, RegisterPayload } from "@/types/user";
import { useI18n } from "@/contexts/I18nContext";

interface UserContextType {
    user: AppUser | null;
    loading: boolean;
    options: {
        modalLogin: boolean;
    };
    getAvatar: () => string;
    getBanner: () => string | null;
    login: (data: LoginPayload) => Promise<boolean>;
    register: (data: RegisterPayload) => Promise<boolean>;
    uploadAvatar: (file: File) => Promise<boolean>;
    removeAvatar: () => Promise<boolean>;
    uploadBanner: (file: File) => Promise<boolean>;
    removeBanner: () => Promise<boolean>;
    updateProfile: (payload: {
        displayName: string;
        description: string;
        profileNote: string;
        profileBannerColor: string;
        profileGradientTop: string;
        profileGradientBottom: string;
    }) => Promise<boolean>;
    modalLogin: () => void;
    logout: () => Promise<void>;
    setOptions: React.Dispatch<React.SetStateAction<UserContextType["options"]>>;
    setUser: React.Dispatch<React.SetStateAction<AppUser | null>>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
    const { t } = useI18n();
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [options, setOptions] = useState<UserContextType["options"]>({
        modalLogin: false,
    });

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const response = await axios.get<AppUser>("/api/auth/login");
                if (response.status === 200) {
                    setUser(response.data);
                } else {
                    setUser(null);
                }
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, []);

    const getAvatar = () => user?.avatarUrl || "/assets/icons/profile-icon-v1.png";
    const getBanner = () => user?.bannerUrl || null;

    const login = async (data: LoginPayload) => {
        try {
            const response = await axios.post<AppUser>("/api/auth/login", data);
            if (response.status === 200) {
                setUser(response.data);
                setOptions((prev) => ({ ...prev, modalLogin: false }));
                return true;
            }
            setUser(null);
            return false;
        } catch (error: any) {
            toast.error(t("user.auth.login_error", "Erro ao fazer login"), {
                description: error?.response?.data?.error || error?.message || "",
            });
            setUser(null);
            return false;
        }
    };

    const register = async (data: RegisterPayload) => {
        try {
            const response = await axios.post<AppUser>("/api/auth/register", data);
            if (response.status === 201) {
                setUser(response.data);
                setOptions((prev) => ({ ...prev, modalLogin: false }));
                return true;
            }
            return false;
        } catch (error: any) {
            toast.error(t("user.auth.register_error", "Erro ao registrar"), {
                description: error?.response?.data?.error || error?.message || "",
            });
            return false;
        }
    };

    const uploadAvatar = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await axios.post<AppUser>("/api/auth/avatar", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            if (response.status === 200) {
                setUser(response.data);
                toast.success(t("user.avatar.updated", "Avatar atualizado com sucesso."));
                return true;
            }
            return false;
        } catch (error: any) {
            toast.error(t("user.avatar.update_error", "Erro ao atualizar avatar"), {
                description: error?.response?.data?.error || error?.message || "",
            });
            return false;
        }
    };

    const removeAvatar = async () => {
        try {
            const response = await axios.delete<AppUser>("/api/auth/avatar");
            if (response.status === 200) {
                setUser(response.data);
                toast.success(t("user.avatar.removed", "Avatar removido."));
                return true;
            }
            return false;
        } catch (error: any) {
            toast.error(t("user.avatar.remove_error", "Erro ao remover avatar"), {
                description: error?.response?.data?.error || error?.message || "",
            });
            return false;
        }
    };

    const uploadBanner = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await axios.post<AppUser>("/api/auth/banner", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            if (response.status === 200) {
                setUser(response.data);
                toast.success(t("user.banner.updated", "Banner atualizado com sucesso."));
                return true;
            }
            return false;
        } catch (error: any) {
            toast.error(t("user.banner.update_error", "Erro ao atualizar banner"), {
                description: error?.response?.data?.error || error?.message || "",
            });
            return false;
        }
    };

    const removeBanner = async () => {
        try {
            const response = await axios.delete<AppUser>("/api/auth/banner");
            if (response.status === 200) {
                setUser(response.data);
                toast.success(t("user.banner.removed", "Banner removido."));
                return true;
            }
            return false;
        } catch (error: any) {
            toast.error(t("user.banner.remove_error", "Erro ao remover banner"), {
                description: error?.response?.data?.error || error?.message || "",
            });
            return false;
        }
    };

    const updateProfile = async (payload: {
        displayName: string;
        description: string;
        profileNote: string;
        profileBannerColor: string;
        profileGradientTop: string;
        profileGradientBottom: string;
    }) => {
        try {
            const response = await axios.patch<AppUser>("/api/auth/profile", payload);
            if (response.status === 200) {
                setUser(response.data);
                toast.success(t("user.profile.updated", "Perfil atualizado."));
                return true;
            }
            return false;
        } catch (error: any) {
            toast.error(t("user.profile.update_error", "Erro ao atualizar perfil"), {
                description: error?.response?.data?.error || error?.message || "",
            });
            return false;
        }
    };

    const modalLogin = () => {
        setOptions((prev) => ({ ...prev, modalLogin: true }));
    };

    const logout = async () => {
        try {
            await axios.delete("/api/auth/login");
        } catch {
            // Mesmo com erro de rede, limpamos estado local.
        } finally {
            setUser(null);
            toast.success(t("user.auth.logout_success", "Deslogado com sucesso."));
        }
    };

    return (
        <UserContext.Provider
            value={{
                user,
                loading,
                options,
                getAvatar,
                getBanner,
                login,
                register,
                uploadAvatar,
                removeAvatar,
                uploadBanner,
                removeBanner,
                updateProfile,
                modalLogin,
                logout,
                setOptions,
                setUser,
            }}
        >
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error("useUser must be used within UserProvider");
    }
    return context;
}
