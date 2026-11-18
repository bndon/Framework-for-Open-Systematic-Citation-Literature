/**
 * Which features are part of a paid plan.
 *
 * This only controls what the interface shows. It is not licence enforcement: when real
 * subscriptions arrive, `currentPlan()` should read a verified licence instead of a constant.
 */
export type Plan = "free" | "pro";

export type ProFeature = "accessHub" | "converter" | "suggestions";

export const PRO_FEATURES: Record<ProFeature, { title: string; icon: string; blurb: string; points: string[] }> = {
  accessHub: {
    title: "Access Hub",
    icon: "🔑",
    blurb: "Find legal ways to read a paper: open versions, institutional access and publisher links, in one place.",
    points: ["Open-access and repository copies for a DOI", "Publisher and institutional access options", "One list of where each paper can be read"],
  },
  converter: {
    title: "Manuscript Analyzer",
    icon: "📄",
    blurb: "Check a manuscript against a conference or journal style before you submit it.",
    points: ["IEEE and ACM style checks", "Section, length and citation format review", "A list of what to fix, with locations"],
  },
  suggestions: {
    title: "Smart suggestions",
    icon: "⚡",
    blurb: "Fill in comparison-table fields automatically from the passages you highlighted.",
    points: ["Proposed values for every field", "Each suggestion links back to its quote", "You accept or reject every one"],
  },
};

const CURRENT_PLAN: Plan = "free";

export const currentPlan = (): Plan => CURRENT_PLAN;

export const isUnlocked = (_feature: ProFeature): boolean => currentPlan() === "pro";
