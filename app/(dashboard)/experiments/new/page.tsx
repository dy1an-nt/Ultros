import { ExperimentConfig } from "@/components/experiments/ExperimentConfig"

export default function NewExperimentPage() {
  return (
    <div className="p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-white">New Experiment</h1>
      <ExperimentConfig />
    </div>
  )
}
