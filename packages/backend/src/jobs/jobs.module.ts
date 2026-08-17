import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LicensingModule } from '../licensing/licensing.module';

/**
 * JobsModule — the DI graph for standalone scheduled jobs.
 *
 * Deliberately minimal and deliberately does NOT import ScheduleModule. These
 * jobs are triggered by an EXTERNAL scheduler (Cloud Scheduler → Cloud Run Job
 * / k8s CronJob), so booting a job context must never spin up the API's
 * in-process crons. It just exposes the service layer the job needs.
 */
@Module({
  imports: [PrismaModule, LicensingModule],
})
export class JobsModule {}
