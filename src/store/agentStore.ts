import { create } from 'zustand'

import type { AgentProposal, ConnectionStatus } from '../types/events'

export interface Decision {
  proposal: AgentProposal
  approved: boolean
  decidedBy: 'human' | 'auto'
  /** Scenario minute the decision was taken, for the audit trail. */
  minute: number
}

export interface Notification {
  id: string
  kind: 'approved' | 'rejected' | 'auto'
  title: { az: string; en: string }
}

interface AgentState {
  status: ConnectionStatus
  /** Proposals waiting on a decision, oldest first. */
  pending: AgentProposal[]
  decisions: Decision[]
  notifications: Notification[]

  setStatus: (status: ConnectionStatus) => void
  raise: (proposal: AgentProposal) => void
  decide: (proposalId: string, approved: boolean, decidedBy: 'human' | 'auto', minute: number) => void
  dismissNotification: (id: string) => void
  /** Drops every proposal and decision, for a scenario reset. */
  reset: () => void
}

export const useAgentStore = create<AgentState>((set) => ({
  status: 'connecting',
  pending: [],
  decisions: [],
  notifications: [],

  setStatus: (status) => set({ status }),

  raise: (proposal) =>
    set((state) =>
      // The feed can re-deliver on reconnect; a queue with the same decision
      // in it twice would make the operator answer it twice.
      state.pending.some((item) => item.id === proposal.id) ||
      state.decisions.some((item) => item.proposal.id === proposal.id)
        ? state
        : { pending: [...state.pending, proposal] },
    ),

  decide: (proposalId, approved, decidedBy, minute) =>
    set((state) => {
      const proposal = state.pending.find((item) => item.id === proposalId)
      if (!proposal) return state

      const notification: Notification = {
        id: `${proposalId}-${state.decisions.length}`,
        kind: decidedBy === 'auto' ? 'auto' : approved ? 'approved' : 'rejected',
        title: proposal.title,
      }

      return {
        pending: state.pending.filter((item) => item.id !== proposalId),
        decisions: [{ proposal, approved, decidedBy, minute }, ...state.decisions],
        notifications: [notification, ...state.notifications].slice(0, 4),
      }
    }),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id),
    })),

  reset: () => set({ pending: [], decisions: [], notifications: [] }),
}))
