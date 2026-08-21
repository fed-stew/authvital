import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { BrokerService } from '../broker.service';

describe('HealthController', () => {
  function build(consuming: boolean): HealthController {
    const brokerService = {
      status: { consuming, transport: 'OutboxPollingSource' },
    } as unknown as BrokerService;
    return new HealthController(brokerService);
  }

  it('should return ok with transport info while consuming', () => {
    const result = build(true).check();

    expect(result.status).toBe('ok');
    expect(result.transport).toBe('OutboxPollingSource');
  });

  it('should 503 when the event source is not consuming (transport liveness, not process-up)', () => {
    expect(() => build(false).check()).toThrow(ServiceUnavailableException);
  });
});
