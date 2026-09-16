import { useEffect, useRef, useState } from 'react'

import { useTranslation } from '../../i18n/useTranslation'
import type { TranslationKey } from '../../i18n/translations'
import { useAgentStore } from '../../store/agentStore'
import { useScenarioStore } from '../../store/scenarioStore'

const AGENT_KEY = {
  triage: 'agent.triage',
  allocator: 'agent.allocator',
  router: 'agent.router',
} as const satisfies Record<string, TranslationKey>

/**
 * The human-in-the-loop step.
 *
 * A high-risk proposal waits indefinitely and the scenario is paused behind
 * it. A low-risk one carries itself out on a visible countdown that the
 * operator can stop — autonomy the operator can see and interrupt, rather
 * than autonomy that happens quietly and is explained afterwards.
 */
export function ApprovalModal() {
  const { t, language } = useTranslation()
  const proposal = useAgentStore((state) => state.pending[0])
  const decide = useAgentStore((state) => state.decide)

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const dialog = useRef<HTMLDivElement>(null)

  const autoSeconds = proposal?.autoApproveSeconds
  const proposalId = proposal?.id

  // Run the countdown for auto-approving proposals.
  useEffect(() => {
    if (!proposalId || autoSeconds === undefined) {
      setSecondsLeft(null)
      return
    }

    setSecondsLeft(autoSeconds)
    const started = performance.now()

    const timer = window.setInterval(() => {
      const remaining = autoSeconds - (performance.now() - started) / 1000
      if (remaining <= 0) {
        window.clearInterval(timer)
        setSecondsLeft(0)
        decide(proposalId, true, 'auto', useScenarioStore.getState().minute)
        return
      }
      setSecondsLeft(remaining)
    }, 100)

    return () => window.clearInterval(timer)
  }, [proposalId, autoSeconds, decide])

  // Move focus into the dialog so a keyboard operator is not left on the page
  // behind it, and let Escape reject.
  useEffect(() => {
    if (!proposalId) return
    dialog.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      decide(proposalId, false, 'human', useScenarioStore.getState().minute)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [proposalId, decide])

  if (!proposal) return null

  const isAuto = proposal.autoApproveSeconds !== undefined
  const minute = () => useScenarioStore.getState().minute
  const progress =
    isAuto && secondsLeft !== null && proposal.autoApproveSeconds
      ? secondsLeft / proposal.autoApproveSeconds
      : 0

  const body = (
    <div
      className={`modal modal--${proposal.risk}${isAuto ? ' modal--floating' : ''}`}
      role="alertdialog"
      // Only the blocking variant is modal; claiming it on the floating card
      // would tell a screen reader the rest of the page is unavailable when it
      // is still perfectly usable.
      aria-modal={isAuto ? undefined : true}
      aria-labelledby="approval-title"
      tabIndex={-1}
      ref={dialog}
    >
      <header className="modal__head">
        <span className="modal__agent">{t(AGENT_KEY[proposal.agent])}</span>
        <span className={`modal__risk modal__risk--${proposal.risk}`}>
          {t(proposal.risk === 'high' ? 'risk.high' : 'risk.low')}
        </span>
      </header>

      <p className="modal__kicker">{t(isAuto ? 'modal.running' : 'modal.needsApproval')}</p>
      <h2 id="approval-title">{proposal.title[language]}</h2>

      <dl className="modal__detail">
        <dt>{t('modal.rationale')}</dt>
        <dd>{proposal.rationale[language]}</dd>
        <dt>{t('modal.impact')}</dt>
        <dd>{proposal.impact[language]}</dd>
        <dt>{t('modal.confidence')}</dt>
        <dd>{Math.round(proposal.confidence * 100)}%</dd>
      </dl>

      {isAuto && secondsLeft !== null ? (
        <div className="modal__countdown">
          <span>
            {t('modal.autoIn')} {Math.ceil(secondsLeft)}s
          </span>
          <div className="modal__bar">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      ) : (
        <p className="modal__paused">{t('modal.paused')}</p>
      )}

      <div className="modal__actions">
        <button
          type="button"
          className="modal__reject"
          onClick={() => decide(proposal.id, false, 'human', minute())}
        >
          {t(isAuto ? 'modal.cancelAuto' : 'modal.reject')}
        </button>
        <button
          type="button"
          className="modal__approve"
          onClick={() => decide(proposal.id, true, 'human', minute())}
        >
          {t('modal.approve')}
        </button>
      </div>
    </div>
  )

  // Only a decision that actually blocks gets a backdrop. A low-risk action is
  // carrying itself out on a timer, and taking the map away from the operator
  // while it counts down would stop them checking whether to let it.
  return isAuto ? body : <div className="modal-backdrop">{body}</div>
}
