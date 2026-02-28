import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      // Use absolute paths - Express requires this for sendFile
      rootPath:
        process.env.NODE_ENV === 'production'
          ? '/app/public'
          : join(process.cwd(), 'public'),
      // Exclude routes handled by NestJS controllers
      exclude: ['/api/*', '/oauth/*', '/.well-known/*'],
      // Don't serve index.html for unmatched routes - let main.ts handle SPA routing
      // This prevents returning HTML for missing asset files (which causes MIME errors)
      serveStaticOptions: {
        index: false, // Don't auto-serve index.html
        fallthrough: true, // Pass to next middleware if file not found
      },
    }),
  ],
})
export class FrontendModule {}
