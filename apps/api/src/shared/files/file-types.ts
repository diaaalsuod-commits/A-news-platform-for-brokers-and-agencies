/** The file types the SRS allows: FR-DAT-06 (media, documents, videos) and FR-AGY-01 (logos). */
export const fileKinds = {
  jpeg: { mimeType: 'image/jpeg', extension: 'jpg' },
  png: { mimeType: 'image/png', extension: 'png' },
  webp: { mimeType: 'image/webp', extension: 'webp' },
  pdf: { mimeType: 'application/pdf', extension: 'pdf' },
  mp4: { mimeType: 'video/mp4', extension: 'mp4' },
  svg: { mimeType: 'image/svg+xml', extension: 'svg' },
} as const;

export type FileKind = keyof typeof fileKinds;

/** How many leading bytes detectBinaryKind reads. */
export const HEAD_BYTES = 12;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

// MP4 brands only. The same container also holds HEIC images and QuickTime files.
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
]);

/** The real type by magic bytes, whatever the file is called. SVG is text, so see svg.ts for it. */
export function detectBinaryKind(head: Buffer): Exclude<FileKind, 'svg'> | null {
  const ascii = (start: number, end: number) => head.toString('latin1', start, end);

  if (head.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'png';
  if (head.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) return 'jpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 5) === '%PDF-') return 'pdf';
  if (ascii(4, 8) === 'ftyp' && MP4_BRANDS.has(ascii(8, 12))) return 'mp4';
  return null;
}
