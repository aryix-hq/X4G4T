import { describe, it, expect, beforeEach } from "vitest";
import {
  isGlobalAiLockdownActive,
  getGlobalAiLockdownDetails,
  setGlobalAiLockdown,
  isPolicyFreezeActive,
  getPolicyFreezeDetails,
  setPolicyFreeze
} from "../src/lockdown.js";

describe("Policy Engine - Emergency Kill-Switch & Policy Freeze", () => {
  beforeEach(() => {
    // Reset state before each test
    setGlobalAiLockdown(false);
    setPolicyFreeze(false);
  });

  describe("Global AI Lockdown (Emergency Kill Switch)", () => {
    it("should default to inactive", () => {
      expect(isGlobalAiLockdownActive()).toBe(false);
      const details = getGlobalAiLockdownDetails();
      expect(details.active).toBe(false);
    });

    it("should engage lockdown with reason and operator", () => {
      setGlobalAiLockdown(true, "Security incident detected in production", "secops-lead");
      expect(isGlobalAiLockdownActive()).toBe(true);

      const details = getGlobalAiLockdownDetails();
      expect(details.active).toBe(true);
      expect(details.reason).toBe("Security incident detected in production");
      expect(details.updatedBy).toBe("secops-lead");
      expect(new Date(details.updatedAt).getTime()).toBeGreaterThan(0);
    });

    it("should disengage lockdown cleanly", () => {
      setGlobalAiLockdown(true, "Emergency", "admin");
      expect(isGlobalAiLockdownActive()).toBe(true);

      setGlobalAiLockdown(false, "Incident resolved", "admin");
      expect(isGlobalAiLockdownActive()).toBe(false);
      expect(getGlobalAiLockdownDetails().reason).toBe("Incident resolved");
    });
  });

  describe("Policy Freeze Mode (Configuration Lock)", () => {
    it("should default to inactive", () => {
      expect(isPolicyFreezeActive()).toBe(false);
      const details = getPolicyFreezeDetails();
      expect(details.active).toBe(false);
    });

    it("should activate policy freeze mode with reason and user", () => {
      setPolicyFreeze(true, "Annual SOC2 compliance audit window", "compliance-officer");
      expect(isPolicyFreezeActive()).toBe(true);

      const details = getPolicyFreezeDetails();
      expect(details.active).toBe(true);
      expect(details.reason).toBe("Annual SOC2 compliance audit window");
      expect(details.updatedBy).toBe("compliance-officer");
    });

    it("should deactivate policy freeze mode", () => {
      setPolicyFreeze(true, "Window open", "admin");
      expect(isPolicyFreezeActive()).toBe(true);

      setPolicyFreeze(false, "Audit complete - normal operations resumed", "admin");
      expect(isPolicyFreezeActive()).toBe(false);
      expect(getPolicyFreezeDetails().reason).toBe("Audit complete - normal operations resumed");
    });
  });
});

