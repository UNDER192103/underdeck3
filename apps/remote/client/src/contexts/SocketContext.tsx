import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { io, ManagerOptions, Socket, SocketOptions } from "socket.io-client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { SocketSettings } from "@/const";
import { useI18n } from "@/contexts/I18nContext";

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
});

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useUser();
    const { t } = useI18n();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const userRef = useRef(user);
    const tRef = useRef(t);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const authenticateSocket = useCallback((targetSocket: Socket) => {
        const currentUser = userRef.current;
        if (!targetSocket.connected) return;

        targetSocket.emit(
            "auth_web",
            currentUser?.id && currentUser?.sessionId
                ? { userId: currentUser.id, sessionId: currentUser.sessionId }
                : {},
            (response: { ok: boolean; authenticated?: boolean; error?: string }) => {
                if (!response?.ok) {
                    if (currentUser?.id) {
                        toast.error(tRef.current("socket.auth_failed", "Falha ao autenticar socket."), {
                            description: response?.error || tRef.current("common.unknown_error", "Erro desconhecido."),
                        });
                    }
                }
            },
        );
    }, []);

    useEffect(() => {
        if (loading) return;

        const options: Partial<ManagerOptions & SocketOptions> = {
            reconnectionAttempts: 5,
            reconnectionDelay: 5000,
            transports: ["websocket"],
            withCredentials: true,
        };

        const newSocket = io(`${SocketSettings.url}/web`, options);
        setSocket(newSocket);

        newSocket.on("connect", () => {
            setIsConnected(true);
            (window as any).__underdeckSocketId = newSocket.id;
            authenticateSocket(newSocket);
        });

        newSocket.on("connect_error", (err) => {
            toast.error(tRef.current("socket.connect_failed", "Falha ao conectar ao servidor em tempo real."), {
                description: `${tRef.current("common.reason", "Motivo")}: ${err.message}.`,
            });
        });

        newSocket.on("disconnect", (reason) => {
            setIsConnected(false);
            (window as any).__underdeckSocketId = undefined;
            if (reason !== "io client disconnect") {
                toast.warning(tRef.current("socket.disconnected_retry", "Desconectado do servidor em tempo real. Tentando reconectar..."));
            }
        });

        newSocket.on("user:updated", (payload) => {
            window.dispatchEvent(new CustomEvent("underdeck:user-updated", { detail: payload }));
        });

        newSocket.on("friends:request", (payload: any) => {
            const from = payload?.fromUser;
            const label = from?.displayName || from?.username || "usuario";
            toast.info(tRef.current("friends.request", "Novo pedido de amizade"), {
                description: `${label}`,
            });
        });

        // Quando o acesso a um dispositivo é removido (revogado, negado, expirado)
        newSocket.on("device:access:resolved", (payload: any) => {
            const status = payload?.status;
            const hwid = payload?.hwid;
            if ((status === "revoked" || status === "denied" || status === "expired") && hwid) {
                // Dispara evento para atualizar a lista de dispositivos e limpar cache
                window.dispatchEvent(new CustomEvent("underdeck:device-access-removed", { detail: payload }));
            }
        });

        // Quando as sessões de um dispositivo são atualizadas
        newSocket.on("device:sessions:updated", (payload: any) => {
            window.dispatchEvent(new CustomEvent("underdeck:device-sessions-updated", { detail: payload }));
        });

        return () => {
            newSocket.off("user:updated");
            newSocket.off("friends:request");
            newSocket.off("device:access:resolved");
            newSocket.off("device:sessions:updated");
            newSocket.disconnect();
            setIsConnected(false);
            setSocket(null);
        };
    }, [authenticateSocket, loading, user?.sessionId]);

    useEffect(() => {
        if (!socket || !socket.connected) {
            return;
        }

        authenticateSocket(socket);
    }, [socket, user, authenticateSocket]);

    return <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>;
};
