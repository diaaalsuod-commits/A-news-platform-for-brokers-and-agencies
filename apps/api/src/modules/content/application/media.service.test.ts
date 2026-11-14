import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { MediaUploadFields } from '@reih/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../../shared/config/index.js';
import { FileStorage } from '../../../shared/files/index.js';
import type { MediaRepository } from '../infrastructure/media.repository.js';
import type { LockedProject, ProjectRepository } from '../infrastructure/project.repository.js';
import { MediaService } from './media.service.js';
import type { PublishGate } from './publish-gate.js';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const FIELDS: MediaUploadFields = {
  type: 'image',
  title: 'Lobby',
  sourceNote: 'Own photography',
  licenseNote: 'Owned by the REIH team',
};
const DRAFT = { status: 'draft' } as LockedProject;

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? filesUnder(child) : [child];
  });
}

/**
 * The cleanup when the row cannot be stored, with in-memory stand-ins for the database and the
 * real FileStorage on a temporary folder. The e2e tests cover the database itself.
 */
describe('MediaService upload cleanup (FR-DAT-06, NFR-08)', () => {
  let root: string;
  let files: FileStorage;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'reih-media-'));
    files = new FileStorage({ FILES_DIR: root } as Env);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function service(options: { lock: LockedProject | null; insert: () => Promise<string> }) {
    const media = {
      projectStatus: async () => 'draft',
      insert: options.insert,
    } as unknown as MediaRepository;
    const projects = {
      transaction: (work: (tx: unknown) => Promise<unknown>) => work({}),
      lock: async () => options.lock,
    } as unknown as ProjectRepository;
    return new MediaService(media, projects, {} as PublishGate, files);
  }

  it('FR-DAT-06 removes the stored file when the row insert fails', async () => {
    const upload = service({
      lock: DRAFT,
      insert: async () => {
        throw new Error('insert failed');
      },
    }).upload('project-1', FIELDS, Readable.from([PNG]), 'user-1');

    await expect(upload).rejects.toThrow('insert failed');
    expect(filesUnder(root)).toEqual([]);
  });

  it('FR-DAT-06 removes the stored file when the project is gone by the time the row is stored', async () => {
    const upload = service({ lock: null, insert: async () => 'never' }).upload(
      'project-1',
      FIELDS,
      Readable.from([PNG]),
      'user-1',
    );

    await expect(upload).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(filesUnder(root)).toEqual([]);
  });

  it('Q4 removes the stored file when the project was archived meanwhile', async () => {
    const upload = service({
      lock: { status: 'archived' } as LockedProject,
      insert: async () => 'never',
    }).upload('project-1', FIELDS, Readable.from([PNG]), 'user-1');

    await expect(upload).rejects.toMatchObject({ code: 'PROJECT_ARCHIVED' });
    expect(filesUnder(root)).toEqual([]);
  });
});
