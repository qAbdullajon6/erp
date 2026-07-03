import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/// Global so any future ERP module can inject PrismaService without each
/// one re-importing PrismaModule.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
