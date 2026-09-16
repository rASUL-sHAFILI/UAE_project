/**
 * The event envelope the dashboard receives over WebSocket.
 *
 * This is the contract with Ali's FastAPI service. It is written here, in the
 * client, because the client is what has to be built first — but it is meant
 * to be read as a specification, not as a client-side convenience. The mock
 * feed emits exactly these shapes, so switching to the real socket is a change
 * of transport and nothing else.
 */

import type { Incident, RescueUnit } from './index'

/** How confident the agent is in its own proposal, 0 to 1. */
export type Confidence = number

/**
 * Whether a proposal may be carried out on a timer or has to be decided by a
 * human. High-risk actions are the ones that move a committed unit away from
 * someone who is already waiting, or that close a road to the public.
 */
export type RiskLevel = 'low' | 'high'

export interface AgentProposal {
  id: string
  /** Which agent raised it, for the audit trail. */
  agent: 'triage' | 'allocator' | 'router'
  title: { az: string; en: string }
  /** Why the agent believes this is the right call. */
  rationale: { az: string; en: string }
  /** What changes if it is approved. */
  impact: { az: string; en: string }
  confidence: Confidence
  risk: RiskLevel
  /**
   * Seconds before a low-risk proposal carries itself out. Absent on high-risk
   * proposals, which wait indefinitely for a person.
   */
  autoApproveSeconds?: number
  raisedAt: string
}

export type DashboardEvent =
  | { type: 'incident.created'; incident: Incident }
  | { type: 'incident.updated'; incident: Incident }
  | { type: 'unit.updated'; unit: RescueUnit }
  | { type: 'agent.proposal'; proposal: AgentProposal }
  | { type: 'agent.decision'; proposalId: string; approved: boolean; decidedBy: 'human' | 'auto' }

/**
 * Where the dashboard is getting its events from.
 *
 * `mock` is a first-class state, not an error: until the backend exists the
 * demo runs on the scripted feed, and the operator is told so plainly rather
 * than being shown a fake "connected" badge.
 */
export type ConnectionStatus = 'connecting' | 'live' | 'mock' | 'reconnecting'
