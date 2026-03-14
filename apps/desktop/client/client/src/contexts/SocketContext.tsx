import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { io, ManagerOptions, Socket, SocketOptions } from "socket.io-client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { SocketSettings } from "@/const";
import { useI18n } from "@/contexts/I18nContext";
import { useObserver } from "@/contexts/ObserverContext";
import { useGlobalObserver } from "@/contexts/GlobalObserverContext";

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
    const { subscribe } = useObserver();
    const { subscribe: subscribeGlobal } = useGlobalObserver();

    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const userRef = useRef(user);
    const tRef = useRef(t);
    const socketRef = useRef<Socket | null>(null);
    const deviceRef = useRef<{ hwid: string; name: string } | null>(null);
    const webdeckVersionRef = useRef<number>(Date.now());

    // Fila para processar requisições webdeck:getMedia uma por vez
    const mediaQueueRef = useRef<Array<() => Promise<void>>>([]);
    const isProcessingMediaRef = useRef(false);

    const enqueueMediaRequest = (task: () => Promise<void>) => {
        mediaQueueRef.current.push(task);
        processMediaQueue();
    };

    const processMediaQueue = async () => {
        if (isProcessingMediaRef.current || mediaQueueRef.current.length === 0) return;
        isProcessingMediaRef.current = true;

        while (mediaQueueRef.current.length > 0) {
            const task = mediaQueueRef.current.shift();
            if (task) {
                try {
                    await task();
                } catch (error) {
                    console.error("Media queue task failed:", error);
                }
                // Pequeno delay entre requisições
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }

        isProcessingMediaRef.current = false;
    };

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);

    useEffect(() => {
        if (!window.underdeck?.webdeck?.onChanged) return;
        const unsubscribe = window.underdeck.webdeck.onChanged((payload) => {
            if (payload?.timestamp) {
                webdeckVersionRef.current = payload.timestamp;
            }
            const currentSocket = socketRef.current;
            if (currentSocket?.connected) {
                currentSocket.emit("webdeck:changed", { timestamp: payload?.timestamp ?? Date.now() });
            }
        });
        return () => {
            unsubscribe?.();
        };
    }, []);

    // Escuta mudanças nos apps e envia para o servidor remote
    useEffect(() => {
        if (!window.underdeck?.apps?.onChanged) return;
        const unsubscribe = window.underdeck.apps.onChanged((payload) => {
            const currentSocket = socketRef.current;
            if (currentSocket?.connected) {
                currentSocket.emit("app:observer:event", {
                    event: { type: "apps:changed", data: { timestamp: payload.timestamp } }
                });
            }
        });
        return () => {
            unsubscribe?.();
        };
    }, []);

    // Escuta eventos do observer e envia atualizações detalhadas para o servidor
    useEffect(() => {
        const unsubscribeWebDeck = subscribe("webdeck", (payload) => {
            const currentSocket = socketRef.current;
            if (!currentSocket?.connected) return;

            if (payload.channel === "webdeck.pages_changed") {
                currentSocket.emit("app:observer:event", {
                    event: { type: "webdeck:pages-changed", data: payload.data }
                });
            }
        });

        const unsubscribeApps = subscribe("apps", (payload) => {
            const currentSocket = socketRef.current;
            if (!currentSocket?.connected) return;

            if (payload.channel === "apps.changed") {
                currentSocket.emit("app:observer:event", {
                    event: { type: "apps:changed", data: payload.data }
                });
            }
        });

        const unsubscribeObs = subscribe("obs", (payload) => {
            const currentSocket = socketRef.current;
            if (!currentSocket?.connected) return;

            if (payload.channel === "obs.state_changed") {
                currentSocket.emit("app:observer:event", {
                    event: { type: "obs:state-changed", data: payload.data }
                });
            }
        });

        const unsubscribeSoundpad = subscribe("soundpad", (payload) => {
            const currentSocket = socketRef.current;
            if (!currentSocket?.connected) return;

            if (payload.channel === "soundpad.audios_changed") {
                currentSocket.emit("app:observer:event", {
                    event: { type: "soundpad:audios-changed", data: payload.data }
                });
            }
        });

        return () => {
            unsubscribeWebDeck();
            unsubscribeApps();
            unsubscribeObs();
            unsubscribeSoundpad();
        };
    }, [subscribe]);

    useEffect(() => {
        if (!window.underdeck?.webdeck?.onChanged) return;
        const unsubscribe = subscribeGlobal("GLOBAL", (payload) => {
            console.log(payload);
        }, false);
        return () => {
            unsubscribe?.();
        };
    }, [subscribeGlobal]);

    const MAX_MEDIA_SIZE = 10 * 1024 * 1024; // 10MB

    const fetchAsDataUrl = async (url: string): Promise<string | null> => {
        const normalized = String(url || "").trim();
        if (!normalized) return null;
        if (normalized.startsWith("data:")) return normalized;
        if (normalized.startsWith("underdeck-media://") || normalized.startsWith("file://") || /^[a-zA-Z]:\\/.test(normalized)) {
            try {
                // Verifica tamanho antes de ler (limite de 10MB)
                const size = await window.underdeck.media.getFileSize(normalized);
                if (size && size > MAX_MEDIA_SIZE) {
                    console.warn(`File too large: ${normalized} (${size} bytes)`);
                    return null;
                }
                return await window.underdeck.media.readAsDataUrl(normalized);
            } catch (error: any) {
                console.log(error);
                return null;
            }
        }
        try {
            const response = await fetch(normalized);
            if (!response.ok) return null;
            // Verifica Content-Length se disponível
            const contentLength = response.headers.get("content-length");
            if (contentLength && parseInt(contentLength, 10) > MAX_MEDIA_SIZE) {
                console.warn(`File too large: ${url} (${contentLength} bytes)`);
                return null;
            }
            const blob = await response.blob();
            if (blob.size > MAX_MEDIA_SIZE) {
                console.warn(`File too large: ${url} (${blob.size} bytes)`);
                return null;
            }
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ""));
                reader.onerror = () => reject(new Error("Failed to read media."));
                reader.readAsDataURL(blob);
            });
            return base64 || null;
        } catch {
            return null;
        }
    };

    const authenticateSocket = useCallback((targetSocket: Socket) => {
        void (async () => {
            const currentUser = userRef.current;
            if (!targetSocket.connected) return;

            let device = deviceRef.current;
            if (!device) {
                try {
                    if (window.underdeck?.system?.getDeviceInfo) {
                        device = await window.underdeck.system.getDeviceInfo();
                    }
                } catch {
                    device = null;
                }

                if (!device) {
                    const key = "underdeck:device:hwid";
                    const stored = String(window.localStorage.getItem(key) || "").trim();
                    const hwid = stored || (typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()));
                    if (!stored) window.localStorage.setItem(key, hwid);
                    device = { hwid, name: String(navigator.userAgent || "Desktop") };
                }

                deviceRef.current = device;
            }

            targetSocket.emit(
                "auth_app",
                currentUser?.id && currentUser?.sessionId
                    ? { userId: currentUser.id, sessionId: currentUser.sessionId, hwid: device.hwid, name: device.name }
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
        })();
    }, []);

    useEffect(() => {
        if (loading) return;

        const options: Partial<ManagerOptions & SocketOptions> = {
            reconnectionAttempts: 5,
            reconnectionDelay: 5000,
            transports: ["websocket"],
            withCredentials: true,
        };

        const newSocket = io(`${SocketSettings.url}/app`, options);
        setSocket(newSocket);

        const onCommand = async (
            payload: { cmd?: string; data?: unknown },
            cb?: (resp: { ok: boolean; data?: unknown; error?: string }) => void,
        ) => {
            const cmd = String(payload?.cmd || "").trim();

            // Garante que o callback só seja chamado uma vez
            let cbCalled = false;
            const safeCb = (resp: { ok: boolean; data?: unknown; error?: string }) => {
                if (cbCalled) return;
                cbCalled = true;
                cb?.(resp);
            };

            try {
                if (!window.underdeck) {
                    safeCb({ ok: false, error: "UnderDeck API not available." });
                    return;
                }

                if (cmd === "webdeck:listPages") {
                    const pages = await window.underdeck.webdeck.listPages();
                    safeCb({ ok: true, data: pages });
                    return;
                }

                if (cmd === "webdeck:getConfig") {
                    const [pages, autoIcons, apps, obsState, soundpadAudios, themePreferences] = await Promise.all([
                        window.underdeck.webdeck.listPages(),
                        window.underdeck.webdeck.listAutoIcons(),
                        window.underdeck.apps.list(),
                        window.underdeck.obs.getState(),
                        window.underdeck.soundpad.listAudios(),
                        window.underdeck.theme.getPreferences("ligth", { variant: "neural" }),
                    ]);

                    safeCb({
                        ok: true,
                        data: {
                            pages,
                            apps,
                            autoIcons,
                            obs: {
                                scenes: obsState?.scenes ?? [],
                                audioInputs: obsState?.audioInputs ?? [],
                            },
                            soundpad: {
                                audios: soundpadAudios ?? [],
                            },
                            theme: {
                                theme: themePreferences?.theme ?? "ligth",
                                background: themePreferences?.background ?? { variant: "neural" },
                            },
                            version: webdeckVersionRef.current,
                        },
                    });
                    return;
                }

                if (cmd === "webdeck:getMedia") {
                    // Adiciona à fila para processar uma requisição de media por vez
                    enqueueMediaRequest(async () => {
                        const urls = Array.isArray((payload?.data as any)?.urls) ? ((payload?.data as any).urls as string[]) : [];
                        const assets: Record<string, string> = {};

                        // Processa URLs em sequência (não em paralelo) para evitar bloqueio
                        for (const url of urls) {
                            try {
                                const dataUrl = await fetchAsDataUrl(String(url || "").trim());
                                if (dataUrl) {
                                    assets[`${url}`] = dataUrl;
                                }
                            } catch (error) {
                                console.error(`Failed to fetch media for ${url}:`, error);
                            }
                        }

                        safeCb({ ok: true, data: { assets } });
                    });
                    return;
                }

                if (cmd === "webdeck:activateItem") {
                    const input = (payload?.data ?? {}) as { type?: string; refId?: string };
                    const type = String(input?.type || "").trim();
                    const refId = String(input?.refId || "").trim();

                    if (type === "app") {
                        await window.underdeck.apps.execute(refId);
                        safeCb({ ok: true, data: true });
                        return;
                    }

                    if (type === "soundpad") {
                        const normalized = refId.startsWith("soundpad-audio:")
                            ? refId.replace("soundpad-audio:", "")
                            : refId;
                        const index = Number(normalized);
                        if (Number.isFinite(index) && index > 0) {
                            const result = await window.underdeck.soundpad.playSound(index);
                            safeCb({ ok: true, data: result });
                            return;
                        }
                        safeCb({ ok: false, error: "Invalid soundpad refId." });
                        return;
                    }

                    if (type === "obs") {
                        if (refId.startsWith("obs-scene:")) {
                            const result = await window.underdeck.obs.setCurrentScene(refId.replace("obs-scene:", ""));
                            safeCb({ ok: true, data: result });
                            return;
                        }
                        if (refId.startsWith("obs-audio:")) {
                            const result = await window.underdeck.obs.toggleInputMute(refId.replace("obs-audio:", ""));
                            safeCb({ ok: true, data: result });
                            return;
                        }
                        if (refId.startsWith("obs-action:")) {
                            const action = refId.replace("obs-action:", "");
                            const actions: Record<string, () => Promise<unknown>> = {
                                startStream: () => window.underdeck.obs.startStream(),
                                stopStream: () => window.underdeck.obs.stopStream(),
                                toggleStream: () => window.underdeck.obs.toggleStream(),
                                startRecord: () => window.underdeck.obs.startRecord(),
                                stopRecord: () => window.underdeck.obs.stopRecord(),
                                toggleRecordPause: () => window.underdeck.obs.toggleRecordPause(),
                                pauseRecord: () => window.underdeck.obs.pauseRecord(),
                                resumeRecord: () => window.underdeck.obs.resumeRecord(),
                            };
                            const exec = actions[action];
                            if (!exec) {
                                safeCb({ ok: false, error: "Invalid OBS action." });
                                return;
                            }
                            const result = await exec();
                            safeCb({ ok: true, data: result });
                            return;
                        }
                        safeCb({ ok: false, error: "Invalid OBS refId." });
                        return;
                    }

                    safeCb({ ok: false, error: `Unsupported item type: ${type}` });
                    return;
                }

                safeCb({ ok: false, error: `Unknown command: ${cmd}` });
            } catch (error: any) {
                safeCb({ ok: false, error: error?.message || "Command failed." });
            }
        };

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

        newSocket.on("app:command", onCommand);

        return () => {
            newSocket.off("user:updated");
            newSocket.off("friends:request");
            newSocket.off("app:command", onCommand);
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
