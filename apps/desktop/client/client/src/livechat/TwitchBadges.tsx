import { useEffect, useMemo, useState } from "react";
import type { TwitchChatTags } from "@/types/electron";

type BadgeVersion = {
  id?: string;
  image_url_1x?: string;
  image_url_2x?: string;
  image_url_4x?: string;
  title?: string;
};

type BadgeCatalog = Record<string, { versions?: Record<string, BadgeVersion> }>;

type BadgeSet = {
  set_id?: string;
  versions?: BadgeVersion[];
};

type BadgeCatalogPayload = BadgeSet[] | { badge_sets?: BadgeSet[] };

const BADGE_PRIORITY = [
  "broadcaster",
  "staff",
  "admin",
  "global_mod",
  "moderator",
  "vip",
  "partner",
  "founder",
  "subscriber",
  "bits",
];

const catalogCache = new Map<string, Promise<BadgeCatalog>>();

function loadCatalog(key: string, url: string) {
  const cached = catalogCache.get(key);
  if (cached) return cached;

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`Badge catalog HTTP ${response.status}`);
      const payload = (await response.json()) as BadgeCatalogPayload;
      const catalog: BadgeCatalog = {};
      const badgeSets = Array.isArray(payload) ? payload : payload.badge_sets;

      for (const badgeSet of badgeSets ?? []) {
        if (!badgeSet.set_id || !Array.isArray(badgeSet.versions)) continue;
        catalog[badgeSet.set_id] = {
          versions: Object.fromEntries(
            badgeSet.versions
              .filter((version) => Boolean(version?.id))
              .map((version) => [String(version.id), version]),
          ),
        };
      }

      return catalog;
    })
    .catch((error) => {
      // The overlay remains fully usable if Twitch is temporarily unreachable.
      catalogCache.delete(key);
      console.warn("[Twitch] Could not load badge catalog:", error);
      return {};
    });
  catalogCache.set(key, request);
  return request;
}

function orderedBadges(badges: Record<string, string>) {
  return Object.entries(badges).sort(([left], [right]) => {
    const leftIndex = BADGE_PRIORITY.indexOf(left);
    const rightIndex = BADGE_PRIORITY.indexOf(right);
    const safeLeft = leftIndex < 0 ? BADGE_PRIORITY.length : leftIndex;
    const safeRight = rightIndex < 0 ? BADGE_PRIORITY.length : rightIndex;
    return safeLeft - safeRight || left.localeCompare(right);
  });
}

export function TwitchBadges({
  tags,
  enabled,
}: {
  tags?: TwitchChatTags;
  enabled: boolean;
}) {
  const badges = tags?.badges ?? {};
  const roomId = String(tags?.["room-id"] ?? "").trim();
  const [catalogs, setCatalogs] = useState<{
    global: BadgeCatalog;
    channel: BadgeCatalog;
  }>({ global: {}, channel: {} });

  useEffect(() => {
    if (!enabled || Object.keys(badges).length === 0) return;
    let disposed = false;
    void Promise.all([
      loadCatalog("global", "https://api.ivr.fi/v2/twitch/badges/global"),
      roomId
        ? loadCatalog(
            `channel:${roomId}`,
            `https://api.ivr.fi/v2/twitch/badges/channel?id=${encodeURIComponent(roomId)}`,
          )
        : Promise.resolve({}),
    ]).then(([global, channel]) => {
      if (!disposed) setCatalogs({ global, channel });
    });
    return () => {
      disposed = true;
    };
  }, [badges, enabled, roomId]);

  const visibleBadges = useMemo(
    () =>
      orderedBadges(badges).flatMap(([name, version]) => {
        const badge =
          catalogs.channel[name]?.versions?.[version] ??
          catalogs.global[name]?.versions?.[version];
        const image = badge?.image_url_1x ?? badge?.image_url_2x;
        if (!image) return [];
        return [
          {
            id: `${name}/${version}`,
            image,
            title: badge?.title || name.replaceAll("_", " "),
          },
        ];
      }),
    [badges, catalogs.channel, catalogs.global],
  );

  if (!enabled || visibleBadges.length === 0) return null;

  return (
    <span className="mr-1 inline-flex items-center gap-0.5 align-middle">
      {visibleBadges.map((badge) => (
        <img
          key={badge.id}
          src={badge.image}
          alt={badge.title}
          title={badge.title}
          className="size-4 shrink-0 object-contain"
        />
      ))}
    </span>
  );
}
