// Sample-only values for the portfolio try-it build. Every use is guarded by
// import.meta.env.VITE_PORTFOLIO_DEMO, which only vite.demo.config.ts defines,
// so regular builds drop these branches.
export const isPortfolioDemo = import.meta.env.VITE_PORTFOLIO_DEMO === "1";

// The default sample receipt repeats foods already in the sample pantry, so its
// save would look like nothing happened. These names are new to the pantry.
export const PORTFOLIO_RECEIPT_LINES = [
  { id: "receipt-potato", rawName: "수미감자 1kg", name: "감자", quantity: "1", unit: "봉", totalPrice: 4980, storage: "실온", confidence: 0.96, requiresReview: false, imageKey: "potato" },
  { id: "receipt-onion", rawName: "양파 1.5kg", name: "양파", quantity: "1", unit: "망", totalPrice: 3980, storage: "실온", confidence: 0.94, requiresReview: false, imageKey: "onion" },
  { id: "receipt-kimchi", rawName: "맛김치 500g", name: "배추김치", quantity: "1", unit: "팩", totalPrice: 6900, storage: "냉장", confidence: 0.63, requiresReview: true, imageKey: "kimchi" },
] as const;

// A recipe that needs one thing the pantry lacks gives the shopping step a real input.
export const PORTFOLIO_MISSING_INGREDIENT = { canonicalName: "대파", amountPerServing: 1, unit: "단" } as const;
