import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';

// Static files are at /app/public. Period.
const STATIC_PATH = '/app/public';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: STATIC_PATH,
    }),
  ],
})
export class FrontendModule {}
