import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marks an endpoint that needs no login. Only auth endpoints and health may use it. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
