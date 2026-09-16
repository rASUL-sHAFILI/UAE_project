/**
 * The decisions the autonomous agents ask for during the scenario.
 *
 * These are the moments the demo is built around. Each one is a real trade-off
 * rather than a confirmation dialog: something is given up whichever way the
 * operator answers, and the rationale says what.
 */

import { scenarioTime } from './floodScenario'
import type { AgentProposal } from '../types/events'

interface ScriptedProposal extends Omit<AgentProposal, 'raisedAt'> {
  /** Scenario minute the agent raises it. */
  minute: number
}

export const PROPOSALS: ScriptedProposal[] = [
  {
    id: 'prop-001',
    minute: 33,
    agent: 'allocator',
    risk: 'high',
    confidence: 0.91,
    title: {
      az: 'BOAT-02 amfiteatra göndərilsin, AMB-07 əvəzinə',
      en: 'Send BOAT-02 to the amphitheatre instead of AMB-07',
    },
    rationale: {
      az: 'Giriş yolunda su 0.6 m-dir. Təcili yardım maşını keçə bilməz, qayıq keçər.',
      en: 'Water on the access road is 0.6 m. An ambulance cannot pass; a boat can.',
    },
    impact: {
      az: 'Altı nəfər 14 dəqiqə tez çıxarılır. AMB-07 tibbi çağırışda qalır.',
      en: 'Six people reached 14 minutes sooner. AMB-07 stays on its medical call.',
    },
  },
  {
    id: 'prop-002',
    minute: 58,
    agent: 'router',
    risk: 'low',
    confidence: 0.86,
    autoApproveSeconds: 12,
    title: {
      az: 'Al Ittihad Rd marşrutu, işıqlar yaşıl saxlanılsın',
      en: 'Route via Al Ittihad Rd, hold the lights green',
    },
    rationale: {
      az: 'Corniche St-də tıxac var. Alternativ marşrut 5 dəqiqə qısadır.',
      en: 'Corniche St is congested. The alternative route is 5 minutes shorter.',
    },
    impact: {
      az: 'Dörd qovşaqda işıq 90 saniyə yaşıl qalır.',
      en: 'Four junctions held green for 90 seconds.',
    },
  },
  {
    id: 'prop-003',
    minute: 84,
    agent: 'allocator',
    risk: 'high',
    confidence: 0.88,
    title: {
      az: 'FIRE-02 zirzəmidən binadakı yanğına keçirilsin',
      en: 'Move FIRE-02 from the basement call to the building fire',
    },
    rationale: {
      az: 'Yanğında 30 nəfər təxliyə olunur. Zirzəmidə insan yoxdur.',
      en: 'Thirty people are being evacuated from the fire. Nobody is in the basement.',
    },
    impact: {
      az: 'Zirzəmi çağırışı 40 dəqiqə gözləyəcək, elektrik paneli riski qalır.',
      en: 'The basement call waits 40 minutes; the electrical panel risk stands.',
    },
  },
  {
    id: 'prop-004',
    minute: 105,
    agent: 'router',
    risk: 'high',
    confidence: 0.79,
    title: {
      az: 'Buhaira Corniche mülki nəqliyyat üçün bağlansın',
      en: 'Close Buhaira Corniche to civilian traffic',
    },
    rationale: {
      az: 'Su 1.4 m-ə çatıb. Hər keçən avtomobil yeni xilasetmə çağırışı riskidir.',
      en: 'Water has reached 1.4 m. Every car that enters is a new rescue call.',
    },
    impact: {
      az: 'Təxliyə axını iki qovşağa yönləndirilir, sıxlıq artır.',
      en: 'Evacuation traffic is pushed onto two junctions; congestion rises.',
    },
  },
  {
    id: 'prop-005',
    minute: 140,
    agent: 'triage',
    risk: 'high',
    confidence: 0.94,
    title: {
      az: 'BOAT-01 damdakı ikilikdən ürək tutmasına keçirilsin',
      en: 'Re-task BOAT-01 from the rooftop pair to the cardiac arrest',
    },
    rationale: {
      az: 'Ürək tutmasında hər dəqiqə sağqalma şansını azaldır. Damdakılar təhlükəsizdir.',
      en: 'Every minute costs survival odds in a cardiac arrest. The rooftop pair are safe.',
    },
    impact: {
      az: 'İki nəfər damda ən azı 25 dəqiqə daha gözləyir.',
      en: 'Two people wait on the roof at least 25 minutes longer.',
    },
  },
]

/** Proposals the agents have raised by this minute, oldest first. */
export function proposalsRaisedBy(minute: number): AgentProposal[] {
  return PROPOSALS.filter((proposal) => minute >= proposal.minute).map(
    ({ minute: raisedMinute, ...proposal }): AgentProposal => ({
      ...proposal,
      raisedAt: scenarioTime(raisedMinute).toISOString(),
    }),
  )
}
