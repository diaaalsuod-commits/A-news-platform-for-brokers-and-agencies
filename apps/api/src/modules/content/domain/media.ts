import { MEDIA_MAX_BYTES, type MediaType } from '@reih/contracts';
import type { FileKind } from '../../../shared/files/index.js';

/** Folder under FILES_DIR; each file gets a new random name there, never the client's. */
export const MEDIA_DIRECTORY = 'project-media';

/** FR-DAT-06: the file types each media type accepts, judged by the file's bytes. */
const MEDIA_KINDS: Record<MediaType, readonly FileKind[]> = {
  image: ['jpeg', 'png', 'webp'],
  floor_plan: ['pdf'],
  brochure: ['pdf'],
  master_plan: ['pdf'],
  video: ['mp4'],
};

/** FR-DAT-06: what an upload of this media type may be, and how large. */
export function uploadRuleOf(type: MediaType): { allowed: readonly FileKind[]; maxBytes: number } {
  return { allowed: MEDIA_KINDS[type], maxBytes: MEDIA_MAX_BYTES[type] };
}

/** Behind the session, for Data Operators; the signed public link waits for its own endpoint. */
export function mediaFileUrl(projectId: string, mediaId: string): string {
  return `/api/v1/content/projects/${projectId}/media/${mediaId}/file`;
}
