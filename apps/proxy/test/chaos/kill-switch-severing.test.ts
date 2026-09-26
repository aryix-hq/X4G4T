import { describe, it, expect } from "vitest";
import {
  registerActiveStream,
  unregisterActiveStream,
  severAllActiveStreams,
  getActiveStreamCount,
  ActiveStreamSession
} from "../../src/services/gateway.js";

describe("SUITE 4.1: Chaos, Resilience & Fail-Safe - Kill Switch Severing & Active Stream Termination", () => {
  it("should track 50 concurrent active streaming sessions", () => {
    const sessions: ActiveStreamSession[] = [];
    for (let i = 0; i < 50; i++) {
      const controller = new AbortController();
      const session = registerActiveStream(`stream_chaos_${i}`, "org_defense_grade", controller);
      sessions.push(session);
    }

    expect(getActiveStreamCount()).toBeGreaterThanOrEqual(50);

    for (let i = 0; i < 50; i++) {
      unregisterActiveStream(`stream_chaos_${i}`);
    }
    expect(getActiveStreamCount()).toBe(0);
  });

  it("should sever 50 concurrent active streaming sessions in <= 5ms upon emergency air-gap engagement", () => {
    const streamSessions: ActiveStreamSession[] = [];
    const abortSignalsTriggered: boolean[] = [];

    for (let i = 0; i < 50; i++) {
      const controller = new AbortController();
      controller.signal.addEventListener("abort", () => {
        abortSignalsTriggered[i] = true;
      });

      const session = registerActiveStream(`active_stream_${i}`, "org_defense_grade", controller);
      streamSessions.push(session);
    }

    expect(getActiveStreamCount()).toBe(50);

    const { severedCount, durationMs } = severAllActiveStreams(
      "EMERGENCY_AIR_GAP_ENGAGED: SYSTEM LOCKDOWN",
      "org_defense_grade"
    );

    expect(severedCount).toBe(50);
    expect(getActiveStreamCount()).toBe(0);
    expect(durationMs).toBeLessThanOrEqual(5);

    for (let i = 0; i < 50; i++) {
      expect(streamSessions[i].controller.signal.aborted).toBe(true);
      expect(abortSignalsTriggered[i]).toBe(true);
    }
  });

  it("should enforce zero residual egress once the kill switch engages mid-flight", async () => {
    const emittedTokensPerStream: number[] = new Array(50).fill(0);
    const residualAttemptsBlocked: number[] = new Array(50).fill(0);
    const controllers: AbortController[] = [];

    for (let i = 0; i < 50; i++) {
      const controller = new AbortController();
      controllers.push(controller);
      registerActiveStream(`midflight_stream_${i}`, "org_enterprise", controller);

      for (let t = 0; t < 5; t++) {
        emittedTokensPerStream[i]++;
      }
    }

    const severResult = severAllActiveStreams("EMERGENCY_LOCKDOWN", "org_enterprise");
    expect(severResult.severedCount).toBe(50);

    for (let i = 0; i < 50; i++) {
      const isAborted = controllers[i].signal.aborted;
      if (!isAborted) {
        emittedTokensPerStream[i]++;
      } else {
        residualAttemptsBlocked[i]++;
      }
    }

    for (let i = 0; i < 50; i++) {
      expect(emittedTokensPerStream[i]).toBe(5);
      expect(residualAttemptsBlocked[i]).toBe(1);
    }
  });
});
