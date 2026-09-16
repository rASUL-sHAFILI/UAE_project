import { useEffect } from 'react'

import { useTranslation } from '../../i18n/useTranslation'
import type { TranslationKey } from '../../i18n/translations'
import { useAgentStore } from '../../store/agentStore'

const KIND_KEY = {
  approved: 'notif.approved',
  rejected: 'notif.rejected',
  auto: 'notif.auto',
} as const satisfies Record<string, TranslationKey>

/** How long a notification stays on screen, in milliseconds. */
const DISMISS_AFTER = 6000

/**
 * Confirmation that a decision was recorded, shown briefly and then cleared.
 *
 * Deliberately not a log. The audit trail belongs beside the incidents, where
 * it can be read after the fact; this is only the immediate acknowledgement
 * that the button did something.
 */
export function NotificationStack() {
  const { t, language } = useTranslation()
  const notifications = useAgentStore((state) => state.notifications)
  const dismiss = useAgentStore((state) => state.dismissNotification)

  useEffect(() => {
    if (notifications.length === 0) return
    const timers = notifications.map((notification) =>
      window.setTimeout(() => dismiss(notification.id), DISMISS_AFTER),
    )
    return () => timers.forEach(window.clearTimeout)
  }, [notifications, dismiss])

  if (notifications.length === 0) return null

  return (
    <div className="toasts" role="status" aria-live="polite">
      {notifications.map((notification) => (
        <div key={notification.id} className={`toast toast--${notification.kind}`}>
          <strong>{t(KIND_KEY[notification.kind])}</strong>
          <span>{notification.title[language]}</span>
        </div>
      ))}
    </div>
  )
}
