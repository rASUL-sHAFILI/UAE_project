import { useEffect } from 'react'

import { connectEventStream } from '../services/eventStream'
import { useAgentStore } from '../store/agentStore'
import { useScenarioStore } from '../store/scenarioStore'

/**
 * Wires the event feed into the stores, and pauses the scenario when an agent
 * needs an answer.
 *
 * Pausing is deliberate. A proposal that scrolls past while the clock keeps
 * running is a proposal nobody decided, and the whole point of the approval
 * step is that a person was actually in the loop.
 */
export function useEventStream() {
  const setStatus = useAgentStore((state) => state.setStatus)
  const raise = useAgentStore((state) => state.raise)

  useEffect(() => {
    return connectEventStream((event) => {
      if (event.type !== 'agent.proposal') return

      raise(event.proposal)
      if (event.proposal.risk === 'high') useScenarioStore.getState().pause()
    }, setStatus)
  }, [raise, setStatus])

  // A reset puts the scenario back to the start, so the decisions taken during
  // the previous run must not survive into the next one.
  useEffect(() => {
    return useScenarioStore.subscribe((state, previous) => {
      if (state.minute === 0 && previous.minute > 0) useAgentStore.getState().reset()
    })
  }, [])
}
