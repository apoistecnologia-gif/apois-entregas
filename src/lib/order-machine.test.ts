import { describe, expect, test } from "bun:test";
import {
  courierNextStatus,
  customerCanCancel,
  isTerminalOrderStatus,
  merchantNextStatuses,
  paymentAllowsFulfillment,
} from "./order-machine";

describe("order state machine", () => {
  test("customer cancellation is limited to pre-fulfillment statuses", () => {
    expect(customerCanCancel("confirmed")).toBe(true);
    expect(customerCanCancel("preparing")).toBe(false);
    expect(customerCanCancel("delivered")).toBe(false);
  });

  test("merchant transitions never skip fulfillment backwards", () => {
    expect(merchantNextStatuses("confirmed")).toEqual(["accepted", "preparing"]);
    expect(merchantNextStatuses("accepted")).toEqual(["preparing"]);
    expect(merchantNextStatuses("preparing")).toEqual(["ready"]);
    expect(merchantNextStatuses("ready")).toEqual([]);
  });

  test("courier transition sequence is deterministic", () => {
    expect(courierNextStatus("accepted")).toBe("arriving_pickup");
    expect(courierNextStatus("arriving_pickup")).toBe("at_pickup");
    expect(courierNextStatus("at_pickup")).toBe("picked_up");
    expect(courierNextStatus("picked_up")).toBe("on_the_way");
    expect(courierNextStatus("on_the_way")).toBe("arrived_destination");
    expect(courierNextStatus("arrived_destination")).toBeNull();
  });

  test("only paid payments can enter fulfillment", () => {
    expect(paymentAllowsFulfillment("paid")).toBe(true);
    expect(paymentAllowsFulfillment("pending")).toBe(false);
    expect(paymentAllowsFulfillment("processing")).toBe(false);
    expect(paymentAllowsFulfillment("refunded")).toBe(false);
  });

  test("terminal statuses are recognized", () => {
    expect(isTerminalOrderStatus("delivered")).toBe(true);
    expect(isTerminalOrderStatus("cancelled")).toBe(true);
    expect(isTerminalOrderStatus("refunded")).toBe(true);
    expect(isTerminalOrderStatus("on_the_way")).toBe(false);
  });
});
