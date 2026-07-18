import { Controller, Get, Param, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Controller('track')
export class EmailTrackingController {
  constructor(private prisma: PrismaService) {}

  @Get('open/:trackingId')
  async trackOpen(@Param('trackingId') trackingId: string, @Res() res: Response) {
    try {
      const tracking = await this.prisma.emailTracking.findUnique({
        where: { id: trackingId },
      });

      if (tracking) {
        await this.prisma.emailTracking.update({
          where: { id: trackingId },
          data: {
            openCount: { increment: 1 },
            firstOpenedAt: tracking.firstOpenedAt || new Date(),
            lastOpenedAt: new Date(),
          },
        });
      }
    } catch (error) {
      // Silent failure - don't expose tracking errors to user
    }

    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    res.writeHead(HttpStatus.OK, {
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(pixel);
  }

  @Get('click/:trackingId')
  async trackClick(
    @Param('trackingId') trackingId: string,
    @Query('url') url: string,
    @Res() res: Response,
  ) {
    try {
      const tracking = await this.prisma.emailTracking.findUnique({
        where: { id: trackingId },
      });

      if (tracking) {
        await this.prisma.emailTracking.update({
          where: { id: trackingId },
          data: {
            clickCount: { increment: 1 },
            firstClickedAt: tracking.firstClickedAt || new Date(),
            lastClickedAt: new Date(),
          },
        });
      }
    } catch (error) {
      // Silent failure
    }

    if (url && this.isValidUrl(url)) {
      return res.redirect(url);
    }

    return res.redirect('/');
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
}
