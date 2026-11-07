import { describe, expect, it } from 'vitest';
import { isSvgDocument, sanitizeSvg } from './svg.js';

const svg = (body: string, rootAttributes = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" ${rootAttributes}>${body}</svg>`;

const PATH = '<path d="M0 0h10v10H0z"/>';

describe('isSvgDocument', () => {
  it('accepts well-formed XML with an <svg> root', () => {
    expect(isSvgDocument(svg(PATH))).toBe(true);
    expect(isSvgDocument(`<?xml version="1.0"?>\n${svg(PATH)}`)).toBe(true);
  });

  it.each([
    ['plain text', 'just some text'],
    ['XML with another root', '<note xmlns="http://www.w3.org/2000/svg"><svg/></note>'],
    ['an svg root outside the SVG namespace', '<svg><path/></svg>'],
    ['malformed XML', '<svg xmlns="http://www.w3.org/2000/svg"><path></svg>'],
    ['an HTML page', '<html><body><svg xmlns="http://www.w3.org/2000/svg"/></body></html>'],
    [
      'a declared entity',
      '<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>',
    ],
  ])('refuses %s', (_name, text) => {
    expect(isSvgDocument(text)).toBe(false);
  });
});

describe('sanitizeSvg', () => {
  it('NFR-08 removes <use href="javascript:...">', () => {
    const clean = sanitizeSvg(svg(`<use href="javascript:alert(1)"/>${PATH}`));
    expect(clean).not.toMatch(/<use/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain('<path');
  });

  it('NFR-08 removes <use xlink:href="javascript:...">', () => {
    const clean = sanitizeSvg(svg(`<use xlink:href="javascript:alert(1)"/>${PATH}`));
    expect(clean).not.toMatch(/<use|javascript:/i);
  });

  it('NFR-08 removes <animate> that sets href', () => {
    const clean = sanitizeSvg(
      svg(
        `<a><animate attributeName="href" to="javascript:alert(1)" begin="0s"/><text>Logo</text></a>${PATH}`,
      ),
    );
    expect(clean).not.toMatch(/<animate/i);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it('NFR-08 removes <set> that sets href', () => {
    const clean = sanitizeSvg(svg(`<set attributeName="href" to="javascript:alert(1)"/>${PATH}`));
    expect(clean).not.toMatch(/<set|javascript:/i);
  });

  it('NFR-08 removes on* attributes from the root and from children', () => {
    const clean = sanitizeSvg(
      svg(`<circle r="5" onclick="alert(1)" onmouseover="alert(2)"/>`, 'onload="alert(3)"'),
    );
    expect(clean).not.toMatch(/\son\w+=/i);
    expect(clean).not.toMatch(/alert/);
    expect(clean).toContain('<circle');
  });

  it('NFR-08 removes script and foreignObject', () => {
    const clean = sanitizeSvg(
      svg(
        `<script>alert(1)</script><foreignObject><iframe src="https://example.test"/></foreignObject>${PATH}`,
      ),
    );
    expect(clean).not.toMatch(/<script|foreignObject|<iframe|alert/i);
  });

  it('NFR-08 removes anything that would load from elsewhere', () => {
    const clean = sanitizeSvg(
      svg(
        `<image href="https://example.test/a.png"/>` +
          `<style>@import url(https://example.test/a.css);</style>` +
          `<rect width="1" height="1" fill="url(https://example.test/a.svg#p)"/>` +
          `<rect width="2" height="2" style="fill:url(https://example.test/b)"/>`,
      ),
    );
    expect(clean).not.toContain('example.test');
    expect(clean).not.toMatch(/<image/i);
  });

  it('keeps what an ordinary logo needs', () => {
    const clean = sanitizeSvg(
      svg(
        `<style>.a{fill:#1F3A5F}</style>` +
          `<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs>` +
          `<rect class="a" width="10" height="10" fill="url(#g)"/>${PATH}`,
      ),
    );
    expect(clean).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(clean).toContain('viewBox="0 0 10 10"');
    expect(clean).toContain('<linearGradient');
    expect(clean).toContain('fill="url(#g)"');
    expect(clean).toContain('.a{fill:#1F3A5F}');
    expect(clean).toContain('<path');
    expect(isSvgDocument(clean ?? '')).toBe(true);
  });

  it('gives null when the input has no svg left', () => {
    expect(sanitizeSvg('<script>alert(1)</script>')).toBeNull();
  });
});
