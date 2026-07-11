import { Module } from "@nestjs/common";
import { OrderWriter } from "./order-writer";

/// The Order's state machine, in one place (AR5).
///
/// A separate module rather than a folder inside Orders or Dispatch, because BOTH
/// need it — Dispatch causes projections, Orders causes commercial transitions —
/// and putting it in either one would force a circular import between them.
@Module({
  providers: [OrderWriter],
  exports: [OrderWriter],
})
export class OrderStateModule {}
