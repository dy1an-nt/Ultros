import { create } from "zustand"
import type { CompareSlotState } from "@/types/models"

type CompareStore = {
  slots: [CompareSlotState, CompareSlotState, CompareSlotState]
  setSlotModel: (index: 0 | 1 | 2, model: string) => void
  setSlotOutput: (index: 0 | 1 | 2, text: string) => void
  setSlotStatus: (index: 0 | 1 | 2, status: CompareSlotState["status"]) => void
  setSlotStats: (index: 0 | 1 | 2, stats: CompareSlotState["stats"]) => void
  setSlotError: (index: 0 | 1 | 2, error: string) => void
  resetSlots: () => void
}

const defaultSlot = (): CompareSlotState => ({ model: "", output: "", status: "idle" })

export const useCompareStore = create<CompareStore>((set) => ({
  slots: [defaultSlot(), defaultSlot(), defaultSlot()],
  setSlotModel: (i, model) =>
    set((s) => {
      const slots = [...s.slots] as typeof s.slots
      slots[i] = { ...slots[i], model }
      return { slots }
    }),
  setSlotOutput: (i, text) =>
    set((s) => {
      const slots = [...s.slots] as typeof s.slots
      slots[i] = { ...slots[i], output: text }
      return { slots }
    }),
  setSlotStatus: (i, status) =>
    set((s) => {
      const slots = [...s.slots] as typeof s.slots
      slots[i] = { ...slots[i], status }
      return { slots }
    }),
  setSlotStats: (i, stats) =>
    set((s) => {
      const slots = [...s.slots] as typeof s.slots
      slots[i] = { ...slots[i], stats }
      return { slots }
    }),
  setSlotError: (i, error) =>
    set((s) => {
      const slots = [...s.slots] as typeof s.slots
      slots[i] = { ...slots[i], error }
      return { slots }
    }),
  resetSlots: () =>
    set((s) => ({
      slots: [
        { ...s.slots[0], output: "", status: "idle", stats: undefined, error: undefined },
        { ...s.slots[1], output: "", status: "idle", stats: undefined, error: undefined },
        { ...s.slots[2], output: "", status: "idle", stats: undefined, error: undefined },
      ] as [CompareSlotState, CompareSlotState, CompareSlotState],
    })),
}))
