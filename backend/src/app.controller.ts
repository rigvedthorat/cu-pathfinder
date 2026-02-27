import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { GraphService } from './graph/graph.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService, private readonly graphService: GraphService) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  @Get('health')
  async getHealth() {
    const isDbConnected = await this.graphService.getDatabaseHealth();
    return {
      status: 'ok',
      database: isDbConnected ? 'connected' : 'disconnected',
    };
  }
}