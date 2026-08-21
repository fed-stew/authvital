import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { BrokerService } from '../broker.service';

/**
 * Health endpoint for Docker/K8s checks.
 *
 * Reflects TRANSPORT liveness, not just process-up: returns 503 until the
 * selected EventSource has started consuming (and again after shutdown
 * begins), so orchestrators never route "healthy" to a broker that is not
 * actually draining events.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly brokerService: BrokerService) {}

  @Get()
  check(): {
    status: string;
    service: string;
    transport: string;
    timestamp: string;
  } {
    const { consuming, transport } = this.brokerService.status;

    if (!consuming) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        service: 'authvital-broker',
        transport,
        reason: 'event source not consuming',
      });
    }

    return {
      status: 'ok',
      service: 'authvital-broker',
      transport,
      timestamp: new Date().toISOString(),
    };
  }
}
