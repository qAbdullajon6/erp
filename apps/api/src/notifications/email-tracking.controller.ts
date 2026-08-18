import { Controller, Get, Param, Res, HttpStatus } from '@nestjs/common';
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
    } catch {
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

  /// The redirect target used to come from a client-supplied `url` query
  /// param, checked only for an http(s) scheme — an open redirect (unauth'd,
  /// any trackingId or none at all) since it was never checked against
  /// anything stored on the tracking record. No code path was found that
  /// actually embeds this link in outgoing email, so there is no legitimate
  /// destination to preserve; always redirecting home closes the redirect
  /// while keeping the click-count instrumentation this endpoint exists for.
  @Get('click/:trackingId')
  async trackClick(@Param('trackingId') trackingId: string, @Res() res: Response) {
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
    } catch {
      // Silent failure
    }

    return res.redirect('/');
  }
}
