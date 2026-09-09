import { EventEmitter } from "node:events";
import {
  ControlEvent,
  TikTokLiveConnection,
  WebcastEvent,
} from "tiktok-live-connector";
import type {
  LiveChatCommandResult,
  LiveChatEvent,
  LiveChatProviderState,
  TikTokLiveChatAccountState,
  TikTokLiveChatSettings,
} from "../../../types/live-chat.js";

type TikTokProviderSettings = {
  enabled: boolean;
  tiktok: TikTokLiveChatSettings;
};

type TikTokProviderEntry = {
  account: string;
  connection: TikTokLiveConnection | null;
  state: TikTokLiveChatAccountState;
  abortController: AbortController | null;
  retryTimer: NodeJS.Timeout | null;
  manualDisconnect: boolean;
  streamEnded: boolean;
  generation: number;
};

type TikTokProviderCallbacks = {
  getSettings: () => TikTokProviderSettings;
  emitEvent: (
    event: string,
    args: unknown[],
    extra: Partial<LiveChatEvent>,
  ) => void;
  emitStateChanged: () => void;
  log: (
    event: string,
    data?: Record<string, unknown>,
    level?: "info" | "warn" | "error",
  ) => void;
};

const defaultState = (account: string): TikTokLiveChatAccountState => ({
  account,
  connected: false,
  connecting: false,
  reconnecting: false,
  waitingForLive: false,
  joinedChannels: [],
  lastError: null,
});

const normalizeAccount = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?tiktok\.com\/@/i, "")
    .replace(/\/live\/?$/i, "")
    .replace(/^@/, "")
    .toLowerCase();

const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

const imageUrl = (value: unknown, seen = new Set<object>()): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first.trim() : null;
  }
  const source = recordValue(value);
  if (value && typeof value === "object") {
    if (seen.has(value)) return null;
    seen.add(value);
  }
  const nested = source.urlList ?? source.url_list ?? source.urls;
  return nested == null ? null : imageUrl(nested, seen);
};

export class TikTokLiveChatProvider {
  private readonly entries = new Map<string, TikTokProviderEntry>();
  // Accounts disconnected explicitly by the user stay opted out of automatic
  // provider/startup connections until that account is connected manually.
  private readonly manualDisconnects = new Set<string>();

  constructor(private readonly callbacks: TikTokProviderCallbacks) {}

  private ensureEntry(rawAccount: string) {
    const account = normalizeAccount(rawAccount);
    let entry = this.entries.get(account);
    if (!entry) {
      entry = {
        account,
        connection: null,
        state: defaultState(account),
        abortController: null,
        retryTimer: null,
        manualDisconnect: false,
        streamEnded: false,
        generation: 0,
      };
      this.entries.set(account, entry);
    }
    return entry;
  }

  private updateState(
    entry: TikTokProviderEntry,
    patch: Partial<TikTokLiveChatAccountState>,
  ) {
    entry.state = { ...entry.state, ...patch, account: entry.account };
    this.callbacks.emitStateChanged();
  }

  private clearPending(entry: TikTokProviderEntry) {
    entry.abortController?.abort();
    entry.abortController = null;
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  }

  private accountSettings(account: string) {
    const settings = this.callbacks.getSettings().tiktok;
    return {
      settings,
      appearance: settings.accountOverrides[account] ?? {
        label: "",
        icon: null,
        eventsEnabled: true,
        waitForLive: true,
      },
    };
  }

  private authorFromEvent(data: unknown) {
    const payload = recordValue(data);
    const user = recordValue(payload.user);
    const details = recordValue(user.userDetails ?? payload.userDetails);
    const username = String(
      user.displayId ??
        user.uniqueId ??
        payload.uniqueId ??
        user.nickname ??
        "unknown",
    );
    return {
      id: String(user.idStr ?? user.userId ?? user.id ?? "") || undefined,
      username,
      displayName: String(user.nickname ?? username),
      avatarUrl:
        imageUrl(user.avatarThumb) ??
        imageUrl(user.avatarMedium) ??
        imageUrl(user.avatarLarge) ??
        imageUrl(details.profilePictureUrls),
      badges: Array.isArray(user.badgeList) ? user.badgeList : [],
    };
  }

  private emitWebcastEvent(account: string, event: string, data: unknown) {
    const payload = recordValue(data);
    const content = payload.content ?? payload.comment;
    if (event === WebcastEvent.CHAT && !String(content ?? "").trim()) return;
    this.callbacks.emitEvent(event === WebcastEvent.CHAT ? "message" : event, [data], {
      channel: account,
      ...(event === WebcastEvent.CHAT
        ? { message: String(content), self: false }
        : {}),
      author: this.authorFromEvent(data),
    });
  }

  private attachEvents(entry: TikTokProviderEntry, connection: TikTokLiveConnection) {
    const emitter = connection as unknown as EventEmitter;
    emitter.on(ControlEvent.CONNECTED, () => {
      if (entry.connection !== connection) return;
      this.updateState(entry, {
        connected: true,
        connecting: false,
        reconnecting: false,
        waitingForLive: false,
        joinedChannels: [entry.account],
        lastError: null,
      });
    });
    emitter.on(ControlEvent.ERROR, (data: unknown) => {
      if (entry.connection !== connection) return;
      const payload = recordValue(data);
      const exception = payload.exception;
      const message =
        exception instanceof Error
          ? exception.message
          : String(payload.info ?? exception ?? "live_chat.error.tiktok_connection");
      this.updateState(entry, { lastError: message });
      this.callbacks.log(
        "live-chat.tiktok.error",
        {
          account: entry.account,
          error: message,
          stack: exception instanceof Error ? exception.stack : undefined,
        },
        "error",
      );
      console.error(`[underdeck:live-chat:tiktok] ${entry.account}`, exception ?? data);
    });
    emitter.on(ControlEvent.DISCONNECTED, (data: unknown) => {
      if (entry.connection !== connection) return;
      entry.connection = null;
      const payload = recordValue(data);
      const reason = String(payload.reason ?? "").trim() || null;
      this.updateState(entry, {
        ...defaultState(entry.account),
        lastError: reason,
      });
      const { enabled, tiktok } = this.callbacks.getSettings();
      if (entry.manualDisconnect || !enabled || !tiktok.enabled) return;
      if (entry.streamEnded && this.accountSettings(entry.account).appearance.waitForLive) {
        entry.streamEnded = false;
        void this.waitForLive(entry);
        return;
      }
      if (tiktok.reconnect) this.scheduleRecovery(entry);
    });

    for (const event of Object.values(WebcastEvent)) {
      emitter.on(event, (data: unknown) => {
        if (entry.connection !== connection) return;
        if (event === WebcastEvent.STREAM_END) entry.streamEnded = true;
        this.emitWebcastEvent(entry.account, event, data);
      });
    }
  }

  private scheduleRecovery(entry: TikTokProviderEntry) {
    this.clearPending(entry);
    this.updateState(entry, {
      connected: false,
      connecting: false,
      reconnecting: true,
      waitingForLive: false,
    });
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      void this.connectAccount(entry.account, true);
    }, 5_000);
  }

  private async waitForLive(entry: TikTokProviderEntry) {
    const { enabled, tiktok } = this.callbacks.getSettings();
    const { appearance } = this.accountSettings(entry.account);
    if (!enabled || !tiktok.enabled || !appearance.waitForLive) return;
    this.clearPending(entry);
    const generation = ++entry.generation;
    const connection = new TikTokLiveConnection(entry.account, {
      processInitialData: false,
      fetchRoomInfoOnConnect: false,
      enableExtendedGiftInfo: false,
    });
    const controller = new AbortController();
    entry.abortController = controller;
    entry.connection = connection;
    this.updateState(entry, {
      connected: false,
      connecting: false,
      reconnecting: false,
      waitingForLive: true,
      joinedChannels: [],
      lastError: null,
    });
    try {
      await connection.waitUntilLive(
        Math.max(30, tiktok.offlineCheckIntervalSeconds),
        controller.signal,
      );
      if (entry.generation !== generation || controller.signal.aborted) return;
      entry.connection = null;
      entry.abortController = null;
      await this.connectAccount(entry.account, false);
    } catch (error) {
      if (controller.signal.aborted || entry.generation !== generation) return;
      entry.connection = null;
      entry.abortController = null;
      const message = error instanceof Error ? error.message : String(error);
      this.updateState(entry, {
        ...defaultState(entry.account),
        lastError: message,
      });
      this.callbacks.log(
        "live-chat.tiktok.wait.error",
        { account: entry.account, error: message },
        "error",
      );
      const latest = this.callbacks.getSettings();
      if (
        !entry.manualDisconnect &&
        latest.enabled &&
        latest.tiktok.enabled &&
        appearance.waitForLive
      ) {
        entry.retryTimer = setTimeout(() => {
          entry.retryTimer = null;
          void this.waitForLive(entry);
        }, Math.max(30, latest.tiktok.offlineCheckIntervalSeconds) * 1000);
      }
    }
  }

  public async connectAccount(
    rawAccount: string,
    recovering = false,
    manual = false,
  ): Promise<LiveChatCommandResult> {
    const account = normalizeAccount(rawAccount);
    const { enabled, tiktok } = this.callbacks.getSettings();
    if (!enabled || !tiktok.enabled) {
      return {
        ok: false,
        message: "Enable TikTok before connecting.",
        code: "live_chat.result.enable_tiktok",
      };
    }
    if (recovering && !tiktok.reconnect) {
      const entry = this.ensureEntry(account);
      entry.manualDisconnect = true;
      this.clearPending(entry);
      entry.connection = null;
      entry.state = defaultState(account);
      this.callbacks.emitStateChanged();
      return {
        ok: false,
        message: "Automatic TikTok reconnection is disabled.",
        code: "live_chat.result.reconnect_disabled",
      };
    }
    if (!tiktok.accounts.includes(account)) {
      return {
        ok: false,
        message: "TikTok account is not configured.",
        code: "live_chat.result.account_not_configured",
      };
    }

    const entry = this.ensureEntry(account);
    if (manual) this.manualDisconnects.delete(account);
    if (!manual && !recovering && this.manualDisconnects.has(account)) {
      return {
        ok: true,
        message: "TikTok account was disconnected manually; waiting for a manual connection.",
        code: "live_chat.result.manual_disconnect_skipped",
      };
    }
    if (entry.state.connected || entry.state.connecting || entry.state.waitingForLive) {
      return {
        ok: true,
        message: "TikTok account is already active.",
        code: "live_chat.result.tiktok_already_active",
      };
    }

    this.clearPending(entry);
    entry.manualDisconnect = false;
    entry.streamEnded = false;
    const generation = ++entry.generation;
    const connection = new TikTokLiveConnection(account, {
      processInitialData: false,
      fetchRoomInfoOnConnect: false,
      // Keep the same free WebSocket flow as the working prototype. Extended
      // gift metadata calls Euler Stream's paid gift endpoint and is not
      // required to receive chat/gift events.
      enableExtendedGiftInfo: false,
    });
    entry.connection = connection;
    this.attachEvents(entry, connection);
    this.updateState(entry, {
      ...defaultState(account),
      connecting: true,
      reconnecting: recovering,
    });

    try {
      const isLive = await connection.fetchIsLive();
      if (entry.generation !== generation) {
        return {
          ok: false,
          message: "Connection cancelled.",
          code: "live_chat.result.connection_cancelled",
        };
      }
      if (!isLive) {
        connection.removeAllListeners();
        entry.connection = null;
        const { appearance } = this.accountSettings(account);
        if (appearance.waitForLive) {
          void this.waitForLive(entry);
          return {
            ok: true,
            message: "Waiting for the TikTok account to go live.",
            code: "live_chat.result.waiting_for_live",
          };
        }
        this.updateState(entry, {
          ...defaultState(account),
          lastError: "live_chat.result.account_offline",
        });
        return {
          ok: false,
          message: "TikTok account is offline.",
          code: "live_chat.result.account_offline",
        };
      }
      const roomId = await connection.fetchRoomId();
      await connection.connect(roomId);
      this.callbacks.log("live-chat.tiktok.connect.success", {
        account,
        roomId,
      });
      return {
        ok: true,
        message: "Connected to TikTok LIVE.",
        code: "live_chat.result.tiktok_connected",
      };
    } catch (error) {
      if (entry.generation !== generation) {
        return {
          ok: false,
          message: "Connection cancelled.",
          code: "live_chat.result.connection_cancelled",
        };
      }
      connection.removeAllListeners();
      entry.connection = null;
      const message = error instanceof Error ? error.message : String(error);
      const { appearance } = this.accountSettings(account);
      if (/offline|isn't online|not live/i.test(message) && appearance.waitForLive) {
        void this.waitForLive(entry);
        return {
          ok: true,
          message: "Waiting for the TikTok account to go live.",
          code: "live_chat.result.waiting_for_live",
        };
      }
      this.updateState(entry, {
        ...defaultState(account),
        lastError: message,
      });
      this.callbacks.log(
        "live-chat.tiktok.connect.error",
        { account, error: message },
        "error",
      );
      if (recovering && tiktok.reconnect) this.scheduleRecovery(entry);
      return { ok: false, message };
    }
  }

  private async connectTargets(
    account: string | undefined,
    manual: boolean,
  ): Promise<LiveChatCommandResult> {
    const settings = this.callbacks.getSettings();
    const targets = account
      ? [normalizeAccount(account)]
      : settings.tiktok.accounts;
    if (targets.length === 0) {
      return {
        ok: false,
        message: "Add at least one TikTok account.",
        code: "live_chat.result.add_tiktok_account",
      };
    }
    const eligibleTargets = manual
      ? targets
      : targets.filter((target) => !this.manualDisconnects.has(target));
    if (eligibleTargets.length === 0) {
      return {
        ok: true,
        message: "No TikTok accounts are eligible for automatic connection.",
        code: "live_chat.result.manual_disconnect_skipped",
      };
    }
    const results = await Promise.all(
      eligibleTargets.map((target) => this.connectAccount(target, false, manual)),
    );
    return results.find((result) => !result.ok) ?? {
      ok: true,
      message: "TikTok accounts started.",
      code: "live_chat.result.tiktok_connected_all",
    };
  }

  public async connect(account?: string): Promise<LiveChatCommandResult> {
    return this.connectTargets(account, true);
  }

  public async connectAutomatically(account?: string): Promise<LiveChatCommandResult> {
    return this.connectTargets(account, false);
  }

  public async disconnectAccount(rawAccount: string, manual = true) {
    const account = normalizeAccount(rawAccount);
    const entry = this.ensureEntry(account);
    if (manual) this.manualDisconnects.add(account);
    entry.streamEnded = false;
    entry.generation += 1;
    this.clearPending(entry);
    const connection = entry.connection;
    entry.connection = null;
    if (connection) {
      connection.removeAllListeners();
      try {
        await connection.disconnect();
      } catch {
        // The WebSocket may already be closed.
      }
    }
    entry.manualDisconnect = manual || this.manualDisconnects.has(account);
    entry.state = defaultState(account);
    this.callbacks.emitStateChanged();
  }

  public async disconnect(
    account?: string,
    manual = true,
  ): Promise<LiveChatCommandResult> {
    const targets = account
      ? [normalizeAccount(account)]
      : [
          ...new Set([
            ...this.entries.keys(),
            ...this.callbacks.getSettings().tiktok.accounts,
          ]),
        ];
    await Promise.all(
      targets.map((target) => this.disconnectAccount(target, manual)),
    );
    return {
      ok: true,
      message: account
        ? "TikTok account disconnected."
        : "TikTok accounts disconnected.",
      code: account
        ? "live_chat.result.tiktok_account_disconnected"
      : "live_chat.result.tiktok_disconnected_all",
    };
  }

  public async disconnectAutomatically(account?: string) {
    return this.disconnect(account, false);
  }

  public async reconcileAccounts(accounts: string[]) {
    const desired = new Set(accounts.map(normalizeAccount));
    for (const account of [...this.entries.keys()]) {
      if (desired.has(account)) continue;
      await this.disconnectAccount(account);
      this.entries.delete(account);
      this.manualDisconnects.delete(account);
    }
    desired.forEach((account) => this.ensureEntry(account));
  }

  /** Cancel pending polling/recovery when the corresponding options change. */
  public reconcileSettings() {
    const latest = this.callbacks.getSettings();
    for (const entry of this.entries.values()) {
      const appearance = this.accountSettings(entry.account).appearance;
      const stopWaiting = entry.state.waitingForLive && !appearance.waitForLive;
      const stopRecovery = entry.state.reconnecting && !latest.tiktok.reconnect;
      if (!stopWaiting && !stopRecovery) continue;
      entry.generation += 1;
      this.clearPending(entry);
      const connection = entry.connection;
      entry.connection = null;
      if (connection) {
        connection.removeAllListeners();
        void connection.disconnect().catch(() => undefined);
      }
      entry.state = defaultState(entry.account);
      this.callbacks.emitStateChanged();
    }
  }

  public getState(): LiveChatProviderState & {
    available: true;
    accounts: Record<string, TikTokLiveChatAccountState>;
  } {
    const configured = this.callbacks.getSettings().tiktok.accounts;
    const accounts = Object.fromEntries(
      configured.map((account) => {
        const entry = this.ensureEntry(account);
        return [account, { ...entry.state, joinedChannels: [...entry.state.joinedChannels] }];
      }),
    );
    const states = Object.values(accounts);
    return {
      available: true,
      accounts,
      connected: states.some((state) => state.connected),
      connecting: states.some((state) => state.connecting),
      reconnecting: states.some((state) => state.reconnecting),
      waitingForLive: states.some((state) => state.waitingForLive),
      joinedChannels: states
        .filter((state) => state.connected)
        .map((state) => state.account),
      lastError: states.find((state) => state.lastError)?.lastError ?? null,
    };
  }
}
