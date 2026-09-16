import { create } from 'zustand'

interface OpsState {
  /** Incident the dispatcher is looking at, or null for the whole picture. */
  selectedIncidentId: string | null
  select: (incidentId: string | null) => void
  /** Clicking the already-selected incident clears it, like a list toggle. */
  toggle: (incidentId: string) => void
}

export const useOpsStore = create<OpsState>((set, get) => ({
  selectedIncidentId: null,
  select: (selectedIncidentId) => set({ selectedIncidentId }),
  toggle: (incidentId) =>
    set({
      selectedIncidentId: get().selectedIncidentId === incidentId ? null : incidentId,
    }),
}))
