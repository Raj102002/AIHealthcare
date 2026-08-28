import type { ConditionConfig } from "@/lib/conditions/types";

export const LYME_CONFIG: ConditionConfig = {
  id: "lyme",
  label: "Lyme Disease",
  corpusDir: "corpus/lyme",
  dataDir: "data/lyme",
  disclaimer:
    "ClearSignal's Lyme disease information is grounded in CDC surveillance " +
    "and educational data. It organizes symptoms, retrieves federal " +
    "guidance, and helps prepare for a clinician visit -- it does not " +
    "diagnose Lyme disease or any other condition.",
  populated: true,
};
