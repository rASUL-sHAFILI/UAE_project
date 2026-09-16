/**
 * The dashboard's connection to the backend event feed.
 *
 * Two transports behind one interface. When `VITE_WS_URL` is set the stream is
 * a real WebSocket to Ali's FastAPI service; when it is not, the stream is the
 * scripted feed driven by the scenario clock. The consumer cannot tell the
 * difference, which is the point: the panel, the modal and the notification
 * stack are all built against the socket from the first day, and the day the
 * backend lands nothing above this file changes.
 *
 * The mock is never dressed up as a live connection. It reports itself as
 * `mock` and the badge in the header says so.
 */

import { PROPOSALS } from '../data/agentProposals'
import { scenarioTime } from '../data/floodScenario'
import { useScenarioStore } from '../store/scenarioStore'
import type { ConnectionStatus, DashboardEvent } from '../types/events'

const WS_URL = import.meta.env.VITE_WS_URL

type EventHandler = (event: DashboardEvent) => void
type StatusHandler = (status: ConnectionStatus) => void

/** Backoff between reconnection attempts, in milliseconds. */
const RECONNECT_DELAYS = [1000, 2000, 5000, 10_000]

/**
 * Opens the event stream and returns a function that closes it.
 *
 * Errors are not thrown to the caller. A dispatcher's screen that goes blank
 * because a socket dropped is worse than one that keeps the last known picture
 * and says it is reconnecting.
 */
export function connectEventStream(
  onEvent: EventHandler,
  onStatus: StatusHandler,
): () => void {
  if (!WS_URL) return connectMock(onEvent, onStatus)
  return connectWebSocket(WS_URL, onEvent, onStatus)
}

function connectWebSocket(
  url: string,
  onEvent: EventHandler,
  onStatus: StatusHandler,
): () => void {
  let socket: WebSocket | null = null
  let attempt = 0
  let retryTimer: number | undefined
  let closed = false

  const open = () => {
    if (closed) return
    onStatus(attempt === 0 ? 'connecting' : 'reconnecting')

    socket = new WebSocket(url)

    socket.onopen = () => {
      attempt = 0
      onStatus('live')
    }

    socket.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as DashboardEvent)
      } catch (error) {
        // One malformed frame must not take down the feed.
        console.error('[eventStream] unreadable frame', error)
      }
    }

    socket.onclose = () => {
      if (closed) return
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]
      attempt += 1
      onStatus('reconnecting')
      retryTimer = window.setTimeout(open, delay)
    }

    socket.onerror = () => socket?.close()
  }

  open()

  return () => {
    closed = true
    window.clearTimeout(retryTimer)
    socket?.close()
  }
}

/**
 * The scripted feed.
 *
 * It watches the scenario clock and emits a proposal the moment the clock
 * passes the minute it is scheduled for. Crossing a minute is detected by
 * comparing against the previous tick rather than by a timer, so scrubbing the
 * timeline forward fires everything it passes and scrubbing back does not
 * re-fire what has already been seen.
 */
function connectMock(onEvent: EventHandler, onStatus: StatusHandler): () => void {
  onStatus('mock')

  const alreadyRaised = new Set<string>()
  let previousMinute = useScenarioStore.getState().minute

  // Anything before the starting position is treated as already delivered, so
  // reloading the page mid-scenario does not replay the whole run at once.
  for (const proposal of PROPOSALS) {
    if (proposal.minute <= previousMinute) alreadyRaised.add(proposal.id)
  }

  const unsubscribe = useScenarioStore.subscribe((state) => {
    const { minute } = state
    if (minute === previousMinute) return

    if (minute > previousMinute) {
      for (const proposal of PROPOSALS) {
        if (alreadyRaised.has(proposal.id)) continue
        if (proposal.minute > previousMinute && proposal.minute <= minute) {
          alreadyRaised.add(proposal.id)
          const { minute: raisedMinute, ...rest } = proposal
          onEvent({
            type: 'agent.proposal',
            proposal: { ...rest, raisedAt: scenarioTime(raisedMinute).toISOString() },
          })
        }
      }
    } else {
      // Scrubbing backwards rewinds what the agents have asked for, so the
      // same decision can be demonstrated twice without reloading.
      for (const proposal of PROPOSALS) {
        if (proposal.minute > minute) alreadyRaised.delete(proposal.id)
      }
    }

    previousMinute = minute
  })

  return unsubscribe
}
