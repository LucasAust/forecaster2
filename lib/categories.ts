/**
 * Transaction categorization utility.
 * Maps merchant names to spending categories using keyword matching.
 * Used throughout the app to standardize transaction categories.
 */

export const CATEGORIES = [
    "Housing",
    "Transport",
    "Groceries",
    "Food & Drink",
    "Shopping",
    "Entertainment",
    "Utilities",
    "Subscriptions",
    "Insurance",
    "Healthcare",
    "Travel",
    "Education",
    "Personal Care",
    "Gifts & Donations",
    "Income",
    "Transfer",
    "Auto",
    "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// Category color mapping for consistent UI colors
export const CATEGORY_COLORS: Record<string, string> = {
    Housing: "#3b82f6",       // blue
    Transport: "#f59e0b",     // amber
    Groceries: "#10b981",     // emerald
    "Food & Drink": "#f97316", // orange
    Shopping: "#8b5cf6",      // violet
    Entertainment: "#ec4899", // pink
    Utilities: "#06b6d4",     // cyan
    Subscriptions: "#a855f7", // purple
    Insurance: "#64748b",     // slate
    Healthcare: "#ef4444",    // red
    Travel: "#14b8a6",        // teal
    Education: "#6366f1",     // indigo
    "Personal Care": "#d946ef", // fuchsia
    "Gifts & Donations": "#f43f5e", // rose
    Income: "#22c55e",        // green
    Transfer: "#94a3b8",      // gray
    Auto: "#eab308",          // yellow
    Other: "#71717a",         // zinc
};

/** Keyword → category mapping. Order matters: first match wins. */
const CATEGORY_RULES: { keywords: string[]; category: Category }[] = [
    // Income
    { keywords: ["payroll", "direct dep", "salary", "wage", "income", "deposit", "paycheck"], category: "Income" },
    // Transfers
    { keywords: ["transfer", "zelle", "venmo", "cashapp", "cash app", "xfer"], category: "Transfer" },
    // Housing
    { keywords: ["rent", "mortgage", "hoa", "property tax", "landlord", "apartment", "real estate"], category: "Housing" },
    // Auto / Transport (note: "uber" and "subway" removed — they match Food & Drink brands first)
    { keywords: ["mazda", "ford motor", "auto loan", "car payment", "car loan", "auto pay"], category: "Auto" },
    // Food & Drink — placed ABOVE Transport so "uber eat" and "subway" match here first
    { keywords: ["starbucks", "mcdonald", "burger", "coffee", "restaurant", "food", "cafe", "pizza", "taco", "chipotle", "subway", "doordash", "grubhub", "uber eat", "postmates", "panera", "chick-fil", "dunkin", "wendy", "domino", "panda express", "five guys", "in-n-out", "jack in the box", "popeyes", "dine", "dining", "bar ", "pub ", "brew", "bakery"], category: "Food & Drink" },
    { keywords: ["lyft", "chevron", "shell", "gas", "exxon", "bp ", "mobil", "texaco", "citgo", "fuel", "sunoco", "parking", "toll", "transit", "metro", "bus fare", "uber trip"], category: "Transport" },
    // Groceries
    { keywords: ["safeway", "whole foods", "trader joe", "market", "costco", "grocery", "kroger", "publix", "aldi", "wegmans", "heb", "food lion", "piggly", "sprouts", "ralph", "harris teeter", "winco", "albertson", "meijer", "stop & shop", "giant"], category: "Groceries" },
    // Subscriptions
    { keywords: ["netflix", "spotify", "hulu", "disney+", "disney plus", "apple music", "youtube", "amazon prime", "hbo", "paramount", "peacock", "crunchyroll", "audible", "claude", "openai", "chatgpt", "adobe", "dropbox", "icloud", "google storage", "microsoft 365", "office 365", "canva", "notion", "github", "gym member", "membership"], category: "Subscriptions" },
    // Entertainment
    { keywords: ["cinema", "movie", "theater", "theatre", "concert", "ticket", "game", "steam", "playstation", "xbox", "nintendo", "twitch", "sport", "bowling", "arcade", "golf", "amusement", "museum", "zoo"], category: "Entertainment" },
    // Utilities
    { keywords: ["pge", "pg&e", "water", "electric", "internet", "at&t", "att ", "verizon", "t-mobile", "tmobile", "comcast", "xfinity", "spectrum", "utility", "utilities", "gas bill", "sewer", "trash", "waste management", "power"], category: "Utilities" },
    // Insurance
    { keywords: ["insurance", "geico", "state farm", "allstate", "progressive", "usaa", "liberty mutual", "farmers", "nationwide", "premium"], category: "Insurance" },
    // Healthcare
    { keywords: ["pharmacy", "cvs", "walgreens", "doctor", "hospital", "medical", "dental", "vision", "health", "clinic", "urgent care", "prescription", "lab", "therapy", "mental health"], category: "Healthcare" },
    // Travel
    { keywords: ["united", "delta", "american air", "southwest", "jetblue", "airbnb", "hotel", "flight", "airline", "marriott", "hilton", "hyatt", "booking.com", "expedia", "trivago", "cruise", "resort"], category: "Travel" },
    // Shopping
    { keywords: ["amazon", "target", "walmart", "ebay", "etsy", "best buy", "apple store", "ikea", "home depot", "lowe", "nordstrom", "macy", "tj maxx", "marshall", "ross", "zappos", "nike", "adidas", "gap", "old navy", "zara", "h&m", "shein", "sparkfun", "online purchase"], category: "Shopping" },
    // Education
    { keywords: ["tuition", "university", "college", "school", "student", "textbook", "udemy", "coursera", "skillshare", "masterclass", "education"], category: "Education" },
    // Personal Care
    { keywords: ["salon", "barber", "haircut", "spa", "nail", "beauty", "skincare", "sephora", "ulta", "cosmetic", "grooming"], category: "Personal Care" },
    // Gifts & Donations
    { keywords: ["gift", "donation", "charity", "nonprofit", "church", "gofundme", "patreon", "tip"], category: "Gifts & Donations" },
];

/**
 * Infers a transaction category from the merchant name and existing Plaid categories.
 * Falls back to keyword matching if no Plaid category is available.
 */
export function inferCategory(tx: {
    category?: string[] | string | null;
    merchant_name?: string;
    name?: string;
    merchant?: string;
}): Category {
    // 1. Check existing Plaid category data
    const existingCategory = Array.isArray(tx.category) ? tx.category[0] : tx.category;
    if (existingCategory && existingCategory !== "Uncategorized" && existingCategory !== "null") {
        // Map Plaid categories to our categories if possible
        const plaidLower = existingCategory.toLowerCase();
        if (plaidLower.includes("food") || plaidLower.includes("restaurant")) return "Food & Drink";
        if (plaidLower.includes("travel") || plaidLower.includes("airline")) return "Travel";
        if (plaidLower.includes("shop") || plaidLower.includes("merchandise")) return "Shopping";
        if (plaidLower.includes("transfer")) return "Transfer";
        if (plaidLower.includes("payment") && plaidLower.includes("rent")) return "Housing";
        if (plaidLower.includes("recreation") || plaidLower.includes("entertainment")) return "Entertainment";
        // If it matches one of our categories exactly, use it
        const match = CATEGORIES.find(c => c.toLowerCase() === plaidLower);
        if (match) return match;
    }

    // 2. Keyword-based matching from merchant name
    const name = (tx.merchant_name || tx.name || tx.merchant || "").toLowerCase();
    if (!name) return "Other";

    for (const rule of CATEGORY_RULES) {
        if (rule.keywords.some(kw => name.includes(kw))) {
            return rule.category;
        }
    }

    return "Other";
}

/**
 * Categorizes an array of transactions, adding/updating the category field.
 */
export function categorizeTransactions<T extends Record<string, any>>(transactions: T[]): T[] {
    return transactions.map(tx => ({
        ...tx,
        category: [inferCategory(tx)],
    }));
}
