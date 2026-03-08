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
    const { user } = useUser();
    const { t } = useI18n();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const userRef = useRef(user);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const authenticateSocket = useCallback((targetSocket: Socket) => {
        const currentUser = userRef.current;
        if (!targetSocket.connected) return;

        targetSocket.emit(
            "auth_app",
            currentUser?.id && currentUser?.sessionId
                ? { userId: currentUser.id, sessionId: currentUser.sessionId }
                : {},
            (response: { ok: boolean; authenticated?: boolean; error?: string }) => {
                if (!response?.ok) {
                    if (currentUser?.id) {
                        toast.error(t("socket.auth_failed", "Falha ao autenticar socket."), {
                            description: response?.error || t("common.unknown_error", "Erro desconhecido."),
                        });
                    }
                }
            },
        );
    }, [t]);

    useEffect(() => {
        const options: Partial<ManagerOptions & SocketOptions> = {
            reconnectionAttempts: 5,
            reconnectionDelay: 5000,
            transports: ["websocket"],
            withCredentials: true,
        };

        const newSocket = io(SocketSettings.url, options);
        setSocket(newSocket);

        newSocket.on("connect", () => {
            setIsConnected(true);
            authenticateSocket(newSocket);
            toast.success(t("socket.connected", "Conectado ao servidor em tempo real."));
        });

        newSocket.on("connect_error", (err) => {
            toast.error(t("socket.connect_failed", "Falha ao conectar ao servidor em tempo real."), {
                description: `${t("common.reason", "Motivo")}: ${err.message}.`,
            });
        });

        newSocket.on("disconnect", (reason) => {
            setIsConnected(false);
            if (reason !== "io client disconnect") {
                toast.warning(t("socket.disconnected_retry", "Desconectado do servidor em tempo real. Tentando reconectar..."));
            }
        });

        return () => {
            newSocket.disconnect();
        };
    }, [authenticateSocket, t]);

    useEffect(() => {
        if (!socket || !socket.connected) {
            return;
        }

        authenticateSocket(socket);
    }, [socket, user, authenticateSocket]);

    return <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>;
};
