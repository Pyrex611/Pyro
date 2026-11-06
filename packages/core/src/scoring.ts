import type { LeadCandidate } from "./types";

export interface ScoreResult {
  score: number;
  reasons: string[];
}

const GENERIC_NAME_PATTERN = /^(active facebook advertiser|advertiser|unnamed|hiring employer|enriched professional|enriched individual|unknown|facebook advertiser|enquiry)/i;
const ROLE_TITLE_WORDS = /^(owner|founder|director|medical director|manager|doctor|physician|ceo|executive)$/i;

export function calculateLeadScore(lead: Partial<LeadCandidate>): ScoreResult {
  let score = 50;
  const reasons: string[] = ["Base baseline score: 50"];

  const rawName = lead.name?.trim() || "";
  const isGenericBusinessName = !rawName || rawName.length < 3 || GENERIC_NAME_PATTERN.test(rawName);

  const hasPhone = Boolean(lead.phone && lead.phone.trim().length >= 7);
  const hasEmail = Boolean(lead.email && lead.email.includes("@"));
  const hasWebsite = Boolean(lead.website && lead.website.trim().length > 0);

  // Strict Person Name Validation: Name must exist, have length > 2, and not just be a job title!
  const dmName = lead.decisionMaker?.name?.trim() || "";
  const hasRealPersonName = Boolean(dmName.length >= 3 && !ROLE_TITLE_WORDS.test(dmName));
  const hasDmTitleOnly = Boolean(!hasRealPersonName && lead.decisionMaker?.title && lead.decisionMaker.title.trim().length > 2);

  const hasAds = lead.signals?.some((s) => s.type === "ad_active" && s.value === true);
  const reviewSignal = lead.signals?.find((s) => s.type === "review_count");
  const reviewCount = typeof reviewSignal?.value === "number" ? reviewSignal.value : 0;
  const isChain = lead.signals?.some((s) => s.type === "is_chain" && s.value === true);

  // 1. GENERIC BUSINESS NAME PENALTY
  if (isGenericBusinessName) {
    score -= 40;
    reasons.push(`-40: Generic or placeholder business name ('${rawName || "Unnamed"}')`);
  }

  // 2. CONTACTABILITY BARRIER
  if (!hasPhone && !hasEmail && !hasWebsite) {
    score -= 50;
    reasons.push("-50: Uncontactable (Missing phone, email, and website)");
  } else if (!hasPhone && !hasEmail && hasWebsite) {
    score -= 15;
    reasons.push("-15: No direct contact channels (Website only — requires manual form outreach)");
  }

  // 3. NO WEBSITE COMBO VALUE
  if (hasWebsite) {
    score += 10;
    reasons.push("+10: Has active digital web presence");
  } else {
    if (hasPhone) {
      score += 20;
      reasons.push("+20: No website with verified direct phone (Prime target for Web + AI Voice Receptionist combo)");
    } else {
      score -= 25;
      reasons.push("-25: No website and no direct phone (Dead lead — cannot contact to pitch web services)");
    }
  }

  // 4. CONTACT CHANNELS
  if (hasPhone) {
    score += 15;
    reasons.push("+15: Direct verified phone number available");
  }

  if (hasEmail) {
    score += 15;
    reasons.push("+15: Direct verified business email");
  }

  // 5. DECISION MAKER BONUS (STRICTLY GATED)
  if (hasRealPersonName) {
    score += 20;
    reasons.push(`+20: Identified decision-maker (${dmName} - ${lead.decisionMaker?.title || "Executive"})`);
    if (lead.decisionMaker?.confidence === "HIGH") {
      score += 5;
      reasons.push("+5: High-confidence verified decision-maker contact");
    }
  } else if (hasDmTitleOnly) {
    score += 5;
    reasons.push(`+5: Target executive role identified (${lead.decisionMaker?.title}) without individual's name`);
  }

  // 6. COMMERCIAL INTENT (ACTIVE ADS)
  if (hasAds) {
    if (hasPhone || hasEmail || (hasWebsite && !isGenericBusinessName)) {
      score += 25;
      reasons.push("+25: High commercial intent (Verified practice running paid ad campaigns)");
    } else {
      score += 5;
      reasons.push("+5: Running ads, but lacking direct contact channels to engage");
    }
  }

  // 7. REPUTATION
  if (reviewCount >= 40) {
    score += 10;
    reasons.push(`+10: Established practice reputation (${reviewCount} verified reviews)`);
  }

  // 8. DISQUALIFIERS
  if (isChain) {
    score -= 40;
    reasons.push("-40: Enterprise chain / corporate hospital conglomerate (Low SMB fit)");
  }

  // Safety clamp: completely uncontactable leads cannot exceed 10
  if (!hasPhone && !hasEmail && !hasWebsite) {
    score = Math.min(score, 10);
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  return { score: boundedScore, reasons };
}