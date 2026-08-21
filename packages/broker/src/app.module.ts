import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BrokerService } from './broker.service';
import { DeliveryModule } from './delivery/delivery.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TransportModule } from './transport/transport.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TransportModule,
    // Real delivery engine (binds DELIVERY_SERVICE). LogOnlyDeliveryService
    // remains available in delivery.interface.ts for tests.
    DeliveryModule,
  ],
  controllers: [HealthController],
  providers: [BrokerService],
})
export class AppModule {}
