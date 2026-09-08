import type { LiveChatProvider } from "@/types/electron";

export function LiveChatProviderIcon({
  provider,
  className = "size-4",
}: {
  provider: LiveChatProvider;
  className?: string;
}) {
  if (provider === "twitch") {
    return (
      <img
        src="../assets/icons/twitch.png"
        alt="Twitch"
        className={`${className} shrink-0 object-contain`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="TikTok"
      className={`${className} shrink-0`}
    >
      <path
        d="M14.2 3v11.1a4.7 4.7 0 1 1-4-4.65"
        fill="none"
        stroke="#25f4ee"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(-.55 .25)"
      />
      <path
        d="M14.2 3c.45 3.15 2.3 5 5.3 5.35"
        fill="none"
        stroke="#fe2c55"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(.55 -.15)"
      />
      <path
        d="M14.2 3v11.1a4.7 4.7 0 1 1-4-4.65M14.2 3c.45 3.15 2.3 5 5.3 5.35"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
