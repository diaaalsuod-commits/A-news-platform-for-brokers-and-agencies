import createDOMPurify, { type WindowLike } from 'dompurify';
import { JSDOM } from 'jsdom';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// A browser's CSP protects a downloaded SVG, but the PDF worker also renders logos. So anything that
// could load from elsewhere goes: links other than #fragment, @import, and url() other than url(#).
const EXTERNAL_CSS = /@import|url\(\s*['"]?\s*(?!#)/i;

const purify = createDOMPurify(new JSDOM('').window as unknown as WindowLike);

purify.addHook('afterSanitizeElements', (node) => {
  if (node.nodeName.toLowerCase() === 'style' && EXTERNAL_CSS.test(node.textContent ?? '')) {
    node.parentNode?.removeChild(node);
  }
});

purify.addHook('afterSanitizeAttributes', (node) => {
  for (const { name, value } of Array.from(node.attributes ?? [])) {
    const isHref = name === 'href' || name === 'xlink:href';
    if ((isHref && !value.trim().startsWith('#')) || EXTERNAL_CSS.test(value)) {
      node.removeAttribute(name);
    }
  }
});

/** True when the text is well-formed XML whose root is an <svg> element. */
export function isSvgDocument(text: string): boolean {
  // jsdom does not expand entities, but a logo has no reason to declare any.
  if (/<!ENTITY/i.test(text)) {
    return false;
  }
  try {
    const { window } = new JSDOM(text, { contentType: 'image/svg+xml' });
    const root = window.document.documentElement;
    const isSvg = root.localName === 'svg' && root.namespaceURI === SVG_NAMESPACE;
    window.close();
    return isSvg;
  } catch {
    return false;
  }
}

/** Returns a safe copy of an SVG document (NFR-08), or null when nothing valid is left. */
export function sanitizeSvg(text: string): string | null {
  const clean = purify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // Without xmlns the file no longer works as a standalone image.
    ADD_ATTR: ['xmlns'],
    // A logo is a still image: no links, no embedded or external images, no animation.
    FORBID_TAGS: ['a', 'image', 'feimage', 'animatecolor', 'animatemotion', 'animatetransform'],
  });
  return isSvgDocument(clean) ? clean : null;
}
