import type { SVGProps } from "react";

/** Ícone vetorial local para não depender de um pacote de ícones de marca. */
export function DiscordIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className} {...props}>
      <path d="M19.54 4.53A16.5 16.5 0 0 0 15.43 3l-.5 1.02a15.2 15.2 0 0 0-5.86 0L8.57 3a16.4 16.4 0 0 0-4.12 1.54C1.85 8.4 1.15 12.16 1.5 15.87A16.6 16.6 0 0 0 6.54 18.4l1.23-1.68a9.8 9.8 0 0 1-1.94-.94l.5-.38c3.74 1.72 7.78 1.72 11.48 0l.5.38c-.62.37-1.27.68-1.94.94l1.23 1.68a16.5 16.5 0 0 0 5.04-2.53c.42-4.3-.72-8.02-3.1-11.34ZM8.56 13.59c-1.12 0-2.03-1.04-2.03-2.32s.9-2.32 2.03-2.32c1.14 0 2.05 1.04 2.03 2.32 0 1.28-.9 2.32-2.03 2.32Zm6.88 0c-1.13 0-2.03-1.04-2.03-2.32s.9-2.32 2.03-2.32c1.13 0 2.04 1.04 2.03 2.32 0 1.28-.9 2.32-2.03 2.32Z" />
    </svg>
  );
}
