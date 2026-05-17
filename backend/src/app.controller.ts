import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { RouteRequestDto } from './route/route.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    const isDbConnected = await this.appService.getDatabaseHealth();
    return {
      status: 'ok',
      database: isDbConnected ? 'connected' : 'disconnected',
    };
  }

  @Post('route')
  async getRoute(@Body() body: RouteRequestDto) {
    return this.appService.getRouteFromNaturalLanguage(
      body.prompt ?? '',
      body.start,
      body.end,
    );
  }
}
