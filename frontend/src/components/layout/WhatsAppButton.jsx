import { useSite } from '@/hooks/useMenu';
import { whatsappLink } from '@/lib/whatsapp';

/** Floating chat button. A generic chat icon is used: no third-party brand logos. */
export function WhatsAppButton() {
  const { data } = useSite();
  return (
    <a
      href={whatsappLink(data?.restaurant.whatsapp)}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-palm group fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full py-3 pr-5 pl-4 text-sm font-semibold text-[#F6EFE3] shadow-xl shadow-black/30 transition-transform hover:-translate-y-0.5 sm:right-6 sm:bottom-6"
      aria-label="Chat with us on WhatsApp (opens in a new tab)"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.5 8.5 0 1 1 21 11.5Z" />
        <path d="M9 9.5c.5 2 2.3 3.9 4.5 4.6" />
      </svg>
      <span className="hidden sm:inline">WhatsApp us</span>
    </a>
  );
}
