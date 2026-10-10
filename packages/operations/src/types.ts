import type { ComponentNode, Registry } from '@ai-slot/registry';

export type Action = 'read' | 'draft' | 'approve' | 'publish' | 'rollback';
export interface Principal { id: string; grants: Record<string, Action[]> }
export interface Source { id: string; version: string; expiresAt: number; data: Record<string, unknown> }
export interface SlotPolicy {
  slotId: string;
  registryVersion: string;
  rendererVersion: string;
  sourceId: string;
  allowedComponents: string[];
  lockedProps: { component: string; prop: string; sourceField: string }[];
  urlProps: { component: string; prop: string }[];
  allowedOrigins: string[];
}
export interface Artifact {
  hash: string;
  slotId: string;
  tree: ComponentNode;
  sourceVersion: string;
  registryVersion: string;
  rendererVersion: string;
  expiresAt: number;
}
export interface Draft {
  id: string;
  artifactHash: string;
  slotId: string;
  baseRevision: number;
  createdBy: string;
  intent: 'publish' | 'rollback';
  createdAt: number;
}
export interface Approval {
  draftId: string;
  artifactHash: string;
  baseRevision: number;
  approvedBy: string;
  expiresAt: number;
}
export interface Release {
  slotId: string;
  revision: number;
  artifactHash: string;
  draftId: string;
  actor: string;
  action: 'publish' | 'rollback';
  at: number;
}
export interface Receipt { revision: number; artifactHash: string; slotId: string }
export interface State {
  format: 1;
  artifacts: Record<string, Artifact>;
  drafts: Record<string, Draft>;
  approvals: Record<string, Approval>;
  releases: Release[];
  pointers: Record<string, Receipt>;
  idempotency: Record<string, { fingerprint: string; receipt: Receipt }>;
}
export interface Store {
  read(): Promise<State>;
  transact<T>(change: (state: State) => T | Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export interface Environment {
  registry: Registry;
  policies: Record<string, SlotPolicy>;
  readSource: (slotId: string) => Promise<Source>;
  now: () => number;
  notify: (slotId: string) => void | Promise<void>;
}
export class OperationError extends Error {
  constructor(public code: string) { super(code); }
}
