import { Module } from '@nestjs/common';
import { FileStorage } from './file-storage.js';
import { SignedUrls } from './signed-urls.js';

@Module({
  providers: [FileStorage, SignedUrls],
  exports: [FileStorage, SignedUrls],
})
export class FilesModule {}
