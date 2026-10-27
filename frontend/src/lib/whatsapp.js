const DEFAULT_TEXT = 'Hello Small Africa, I’d like to ask about…';

export function whatsappLink(number, text = DEFAULT_TEXT) {
  const digits = (number ?? '+2347000000000').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
