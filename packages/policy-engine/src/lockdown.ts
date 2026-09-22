import { readFileSync, writeFileSync, existsSync } from "node:fs";

const LOCKDOWN_FILE_PATH = process.env.X4G4T_LOCKDOWN_FILE || "/tmp/x4g4t-lockdown.json";

interface SharedLockdownState {
  lockdownActive: boolean;
  lockdownReason: string;
  lockdownUpdatedAt: string;
  lockdownUpdatedBy: string;
  freezeActive: boolean;
  freezeReason: string;
  freezeUpdatedAt: string;
  freezeUpdatedBy: string;
}

function readSharedState(): SharedLockdownState | null {
  try {
    if (existsSync(LOCKDOWN_FILE_PATH)) {
      const content = readFileSync(LOCKDOWN_FILE_PATH, "utf8");
      return JSON.parse(content) as SharedLockdownState;
    }
  } catch {}
  return null;
}

function writeSharedState(state: Partial<SharedLockdownState>): void {
  try {
    const existing = readSharedState() || {
      lockdownActive: false,
      lockdownReason: "Emergency AI kill-switch engaged by SecOps.",
      lockdownUpdatedAt: new Date().toISOString(),
      lockdownUpdatedBy: "SecOps Administrator",
      freezeActive: false,
      freezeReason: "Policy editing frozen by SecOps to prevent configuration drift.",
      freezeUpdatedAt: new Date().toISOString(),
      freezeUpdatedBy: "SecOps Administrator"
    };

    const merged = { ...existing, ...state };
    writeFileSync(LOCKDOWN_FILE_PATH, JSON.stringify(merged), "utf8");
  } catch {}
}

let globalAiLockdownActive = false;
let globalAiLockdownReason = "Emergency AI kill-switch engaged by SecOps.";
let globalAiLockdownUpdatedAt = new Date().toISOString();
let globalAiLockdownUpdatedBy = "SecOps Administrator";

export function isGlobalAiLockdownActive(): boolean {
  if (globalAiLockdownActive || process.env.GLOBAL_AI_LOCKDOWN === "true") {
    return true;
  }
  const shared = readSharedState();
  if (shared?.lockdownActive) {
    globalAiLockdownActive = true;
    globalAiLockdownReason = shared.lockdownReason;
    globalAiLockdownUpdatedAt = shared.lockdownUpdatedAt;
    globalAiLockdownUpdatedBy = shared.lockdownUpdatedBy;
    return true;
  }
  return false;
}

export function getGlobalAiLockdownDetails(): {
  active: boolean;
  reason: string;
  updatedAt: string;
  updatedBy: string;
} {
  const active = isGlobalAiLockdownActive();
  return {
    active,
    reason: globalAiLockdownReason,
    updatedAt: globalAiLockdownUpdatedAt,
    updatedBy: globalAiLockdownUpdatedBy
  };
}

export function setGlobalAiLockdown(active: boolean, reason?: string, updatedBy?: string): void {
  globalAiLockdownActive = active;
  globalAiLockdownUpdatedAt = new Date().toISOString();
  if (reason) {
    globalAiLockdownReason = reason;
  }
  if (updatedBy) {
    globalAiLockdownUpdatedBy = updatedBy;
  }

  writeSharedState({
    lockdownActive: active,
    lockdownReason: globalAiLockdownReason,
    lockdownUpdatedAt: globalAiLockdownUpdatedAt,
    lockdownUpdatedBy: globalAiLockdownUpdatedBy
  });
}

// ============================================================================
// Policy Freeze Mode / Policy Immutability Lock
// ============================================================================

let policyFreezeActive = false;
let policyFreezeReason = "Policy editing frozen by SecOps to prevent configuration drift.";
let policyFreezeUpdatedAt = new Date().toISOString();
let policyFreezeUpdatedBy = "SecOps Administrator";

export function isPolicyFreezeActive(): boolean {
  if (policyFreezeActive || process.env.POLICY_FREEZE_ACTIVE === "true") {
    return true;
  }
  const shared = readSharedState();
  if (shared?.freezeActive) {
    policyFreezeActive = true;
    policyFreezeReason = shared.freezeReason;
    policyFreezeUpdatedAt = shared.freezeUpdatedAt;
    policyFreezeUpdatedBy = shared.freezeUpdatedBy;
    return true;
  }
  return false;
}

export function getPolicyFreezeDetails(): {
  active: boolean;
  reason: string;
  updatedAt: string;
  updatedBy: string;
} {
  const active = isPolicyFreezeActive();
  return {
    active,
    reason: policyFreezeReason,
    updatedAt: policyFreezeUpdatedAt,
    updatedBy: policyFreezeUpdatedBy
  };
}

export function setPolicyFreeze(active: boolean, reason?: string, updatedBy?: string): void {
  policyFreezeActive = active;
  policyFreezeUpdatedAt = new Date().toISOString();
  if (reason) {
    policyFreezeReason = reason;
  }
  if (updatedBy) {
    policyFreezeUpdatedBy = updatedBy;
  }

  writeSharedState({
    freezeActive: active,
    freezeReason: policyFreezeReason,
    freezeUpdatedAt: policyFreezeUpdatedAt,
    freezeUpdatedBy: policyFreezeUpdatedBy
  });
}
