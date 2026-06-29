import { describe, expect, it } from 'vitest'
import { type AnkiSchedule, reviewStateFromAnki } from '../ankiScheduling'

const SEC = 1000
const CRT = 1_600_000_000 // collection creation, epoch seconds
const NOW = 1_700_000_000_000 // epoch ms

const sched = (o: Partial<AnkiSchedule>): AnkiSchedule => ({
  type: 0,
  queue: 0,
  due: 0,
  ivl: 0,
  reps: 0,
  lapses: 0,
  mod: 0,
  ...o,
})

describe('reviewStateFromAnki', () => {
  it('treats a never-studied card (reps 0) as new', () => {
    const rs = reviewStateFromAnki(sched({ type: 0, reps: 0 }), CRT, NOW)
    expect(rs).toEqual({ box: 0, due: NOW, reps: 0, lapses: 0, lastReviewed: null })
  })

  it('treats a new-type card as new even with stray ivl', () => {
    const rs = reviewStateFromAnki(sched({ type: 0, ivl: 5, reps: 0 }), CRT, NOW)
    expect(rs.reps).toBe(0)
    expect(rs.box).toBe(0)
  })

  it('maps a mature review card: interval → box, days-since-crt → due', () => {
    const rs = reviewStateFromAnki(
      sched({ type: 2, queue: 2, due: 100, ivl: 15, reps: 8, lapses: 1, mod: 1_650_000_000 }),
      CRT,
      NOW,
    )
    expect(rs.reps).toBe(8)
    expect(rs.lapses).toBe(1)
    expect(rs.box).toBe(4) // intervals [0,1,2,4,8,16]: 15 → box 4 (8 ≤ 15 < 16)
    expect(rs.due).toBe((CRT + 100 * 86400) * 1000)
    expect(rs.lastReviewed).toBe(1_650_000_000 * SEC)
  })

  it('maps interval to the nearest lower box', () => {
    const box = (ivl: number) =>
      reviewStateFromAnki(sched({ type: 2, queue: 2, ivl, reps: 1, due: 0 }), CRT, NOW).box
    expect(box(1)).toBe(1)
    expect(box(3)).toBe(2)
    expect(box(4)).toBe(3)
    expect(box(16)).toBe(5)
    expect(box(400)).toBe(5) // capped at max box
  })

  it('never drops a studied card below box 1', () => {
    expect(reviewStateFromAnki(sched({ type: 2, queue: 2, ivl: 0, reps: 1 }), CRT, NOW).box).toBe(1)
  })

  it('reads learning/relearning due as an epoch-seconds timestamp', () => {
    const due = 1_650_500_000
    const rs = reviewStateFromAnki(sched({ type: 3, queue: 1, due, ivl: 1, reps: 12, lapses: 3 }), CRT, NOW)
    expect(rs.due).toBe(due * SEC)
    expect(rs.box).toBe(1)
    expect(rs.lapses).toBe(3)
  })

  it('converts a negative (sub-day, seconds) interval to days', () => {
    const rs = reviewStateFromAnki(sched({ type: 2, queue: 2, ivl: -3600, reps: 2, due: 0 }), CRT, NOW)
    expect(rs.box).toBe(1) // <1 day → box 1
  })

  it('falls back to "due now" when crt is missing for a review card', () => {
    const rs = reviewStateFromAnki(sched({ type: 2, queue: 2, due: 50, ivl: 5, reps: 3 }), 0, NOW)
    expect(rs.due).toBe(NOW)
  })

  it('imports a suspended review card using its schedule (no suspend concept)', () => {
    const rs = reviewStateFromAnki(sched({ type: 2, queue: -1, due: 10, ivl: 8, reps: 4 }), CRT, NOW)
    expect(rs.reps).toBe(4)
    expect(rs.due).toBe((CRT + 10 * 86400) * 1000)
  })

  it('clamps negative lapses to zero', () => {
    const rs = reviewStateFromAnki(sched({ type: 2, queue: 2, ivl: 2, reps: 1, lapses: -5 }), CRT, NOW)
    expect(rs.lapses).toBe(0)
  })

  it('leaves lastReviewed null when mod is absent', () => {
    const rs = reviewStateFromAnki(sched({ type: 2, queue: 2, ivl: 2, reps: 1, mod: 0 }), CRT, NOW)
    expect(rs.lastReviewed).toBeNull()
  })

  it('schedules a long-past review as due now (reviewable immediately)', () => {
    const rs = reviewStateFromAnki(sched({ type: 2, queue: 2, due: 0, ivl: 1, reps: 1 }), CRT, NOW)
    // due = crt day 0; well before NOW → due in the past (reviewable now).
    expect(NOW - rs.due).toBeGreaterThan(0)
  })
})
