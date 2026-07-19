export const PREMIUM_PLANS = {
  "student-premium": {
    id: "student-premium",
    name: "Student Premium",
    monthly: 1000,
    yearly: 10000,
  },
};

export const getPremiumPlan = (planId = "student-premium") =>
  PREMIUM_PLANS[planId] || PREMIUM_PLANS["student-premium"];

export const getPremiumAmount = (planId, billing = "monthly") => {
  const plan = getPremiumPlan(planId);
  return billing === "yearly" ? plan.yearly : plan.monthly;
};
