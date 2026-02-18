/**
 * Merchant name normalization utility.
 * Cleans raw bank-feed merchant names into human-readable names.
 * Example: "ACH Withdrawal APPLECARD GSBANK PAYMENT" → "Apple Card"
 */

/** Known merchant name mappings: raw pattern → clean name */
const MERCHANT_MAP: { pattern: RegExp; name: string }[] = [
    // Payments / Cards
    { pattern: /apple\s*card|applecard|gsbank/i, name: "Apple Card" },
    { pattern: /sofi|sofi\s*bank/i, name: "SoFi" },
    { pattern: /mazda\s*financial|mazda\s*fin/i, name: "Mazda Financial" },
    { pattern: /chase/i, name: "Chase" },
    { pattern: /wells\s*fargo/i, name: "Wells Fargo" },
    { pattern: /bank\s*of\s*america|bofa/i, name: "Bank of America" },
    { pattern: /capital\s*one/i, name: "Capital One" },
    { pattern: /paypal/i, name: "PayPal" },
    { pattern: /discover\s*e-?|discover\s*payment/i, name: "Discover" },
    { pattern: /clerky/i, name: "Clerky" },

    // Telecom
    { pattern: /att\*?\s*bill|at&t|att\s+/i, name: "AT&T" },
    { pattern: /t-?mobile/i, name: "T-Mobile" },
    { pattern: /verizon/i, name: "Verizon" },
    { pattern: /comcast|xfinity/i, name: "Xfinity" },
    { pattern: /spectrum/i, name: "Spectrum" },

    // Streaming / Subscriptions
    { pattern: /netflix/i, name: "Netflix" },
    { pattern: /spotify/i, name: "Spotify" },
    { pattern: /hulu/i, name: "Hulu" },
    { pattern: /disney\s*\+|disneyplus/i, name: "Disney+" },
    { pattern: /hbo\s*max|hbo/i, name: "HBO Max" },
    { pattern: /apple\s*music/i, name: "Apple Music" },
    { pattern: /youtube\s*(premium|music)?/i, name: "YouTube" },
    { pattern: /amazon\s*prime/i, name: "Amazon Prime" },
    { pattern: /audible/i, name: "Audible" },
    { pattern: /claude\.?ai|anthropic/i, name: "Anthropic" },
    { pattern: /openai|chatgpt/i, name: "OpenAI" },
    { pattern: /adobe/i, name: "Adobe" },
    { pattern: /playstation|psn/i, name: "PlayStation" },
    { pattern: /help\.?max\.?com|\bmax\.com/i, name: "Max" },
    { pattern: /creem\.?io/i, name: "Creem.io" },

    // Dev Tools / SaaS
    { pattern: /digitalocean|digital\s*ocean/i, name: "DigitalOcean" },
    { pattern: /supabase/i, name: "Supabase" },
    { pattern: /github/i, name: "GitHub" },
    { pattern: /google\s*cloud|gcp|google\s*\*cloud/i, name: "Google Cloud" },
    { pattern: /codetwo|code\s*two/i, name: "CodeTwo" },
    { pattern: /li\s*drum\s*bus/i, name: "LI Drum Bus" },
    { pattern: /render\.?com|render\s/i, name: "Render" },
    { pattern: /vercel/i, name: "Vercel" },
    { pattern: /railway/i, name: "Railway" },
    { pattern: /aws|amazon\s*web/i, name: "AWS" },

    // Rent / Housing
    { pattern: /\bbilt\b/i, name: "Bilt (Rent)" },

    // Utilities
    { pattern: /dominion\s*energy|dominion\s*va/i, name: "Dominion Energy" },
    { pattern: /pg&?e|pacific\s*gas/i, name: "PG&E" },
    { pattern: /duke\s*energy/i, name: "Duke Energy" },
    { pattern: /johnsoncityenerg/i, name: "Johnson City Energy" },

    // Services
    { pattern: /petscreening/i, name: "Petscreening" },
    { pattern: /arc\s*predict/i, name: "Arc Predict" },
    { pattern: /dept\s*education|student\s*l[no]/i, name: "Dept of Education" },

    // Travel / Airlines
    { pattern: /allegn?a?n?t\s*air/i, name: "Allegiant Air" },
    { pattern: /southwest/i, name: "Southwest Airlines" },
    { pattern: /united\s*air/i, name: "United Airlines" },
    { pattern: /delta\s*air/i, name: "Delta Airlines" },
    { pattern: /american\s*air/i, name: "American Airlines" },
    { pattern: /jetblue/i, name: "JetBlue" },

    // Shipping / Postal
    { pattern: /usps|postal\s*service/i, name: "USPS" },
    { pattern: /fedex/i, name: "FedEx" },
    { pattern: /ups\b/i, name: "UPS" },

    // Food & Drink
    { pattern: /starbucks/i, name: "Starbucks" },
    { pattern: /mcdonald/i, name: "McDonald's" },
    { pattern: /chick-?fil-?a/i, name: "Chick-fil-A" },
    { pattern: /chipotle/i, name: "Chipotle" },
    { pattern: /dunkin/i, name: "Dunkin'" },
    { pattern: /wendy/i, name: "Wendy's" },
    { pattern: /domino/i, name: "Domino's" },
    { pattern: /panera/i, name: "Panera Bread" },
    { pattern: /doordash/i, name: "DoorDash" },
    { pattern: /grubhub/i, name: "Grubhub" },
    { pattern: /uber\s*eat/i, name: "Uber Eats" },
    { pattern: /waffle\s*house/i, name: "Waffle House" },
    { pattern: /cookout/i, name: "Cook Out" },
    { pattern: /cava\b/i, name: "CAVA" },
    { pattern: /wingstop/i, name: "Wingstop" },
    { pattern: /panda\s*express/i, name: "Panda Express" },
    { pattern: /tropical\s*smoothie/i, name: "Tropical Smoothie" },
    { pattern: /yee\s*haw/i, name: "Yee Haw Brewing" },
    { pattern: /tootsies/i, name: "Tootsies Orchid" },
    { pattern: /food\s*city/i, name: "Food City" },

    // Transport
    { pattern: /uber(?!\s*eat)/i, name: "Uber" },
    { pattern: /lyft/i, name: "Lyft" },
    { pattern: /chevron/i, name: "Chevron" },
    { pattern: /shell\s*(oil)?/i, name: "Shell" },
    { pattern: /exxon/i, name: "ExxonMobil" },
    { pattern: /speedway/i, name: "Speedway" },
    { pattern: /bp\b/i, name: "BP" },
    { pattern: /wawa/i, name: "Wawa" },

    // Shopping
    { pattern: /amazon(?!\s*prime)\.?com?/i, name: "Amazon" },
    { pattern: /amazon\s*mkt/i, name: "Amazon" },
    { pattern: /walmart/i, name: "Walmart" },
    { pattern: /\btarget\b/i, name: "Target" },
    { pattern: /costco/i, name: "Costco" },
    { pattern: /best\s*buy/i, name: "Best Buy" },
    { pattern: /home\s*depot/i, name: "Home Depot" },
    { pattern: /ikea/i, name: "IKEA" },

    // Groceries
    { pattern: /whole\s*foods/i, name: "Whole Foods" },
    { pattern: /trader\s*joe/i, name: "Trader Joe's" },
    { pattern: /safeway/i, name: "Safeway" },
    { pattern: /kroger/i, name: "Kroger" },
    { pattern: /publix/i, name: "Publix" },
    { pattern: /aldi/i, name: "Aldi" },
    { pattern: /harris\s*teeter/i, name: "Harris Teeter" },
    { pattern: /food\s*lion/i, name: "Food Lion" },

    // Insurance
    { pattern: /geico/i, name: "GEICO" },
    { pattern: /state\s*farm/i, name: "State Farm" },
    { pattern: /progressive/i, name: "Progressive" },

    // Health / Pharmacy / Optical
    { pattern: /cvs/i, name: "CVS Pharmacy" },
    { pattern: /walgreens/i, name: "Walgreens" },
    { pattern: /america'?s\s*best/i, name: "America's Best" },

    // Transfers / P2P
    { pattern: /zelle/i, name: "Zelle" },
    { pattern: /venmo/i, name: "Venmo" },
    { pattern: /cash\s*app/i, name: "Cash App" },
    { pattern: /robinhood/i, name: "Robinhood" },
];

/** Noise words to strip from raw merchant names */
const NOISE_PATTERNS = [
    /^(ach|pos|debit|credit|purchase|withdrawal|deposit|payment|online|recurring|check|chk|electronic)\s*/gi,
    /\s*(ach|pos|debit|credit|purchase|withdrawal|deposit|payment|online|recurring|check|chk|electronic)\s*$/gi,
    /\s+(inc|llc|ltd|corp|co|company|enterprises)\.?\s*$/gi,
    /\s*#\d+\s*/g,     // Store numbers like #1234
    /\s*\d{4,}\s*/g,   // Long number sequences (reference numbers)
    /\s*\*+\s*/g,      // Asterisks used as separators
    /\s{2,}/g,         // Multiple spaces → single space
];

/**
 * Cleans a raw bank-feed merchant name into a human-readable format.
 * 
 * @param rawName - The raw merchant name from the bank feed
 * @returns A cleaned, human-readable merchant name
 */
export function cleanMerchantName(rawName: string): string {
    if (!rawName) return "Unknown";

    // 0. Extract the actual merchant from debit-card purchase patterns.
    //    Many banks embed the real merchant after a delimiter like &@# or @#
    //    e.g. "DEBIT PURCHASE 0128 4883&@#AMERICA'S BEST" → "AMERICA'S BEST"
    let nameToClean = rawName;
    const debitDelimiterMatch = rawName.match(/[&@#]{2,}\s*(.+)$/i);
    if (debitDelimiterMatch && debitDelimiterMatch[1].trim().length > 2) {
        nameToClean = debitDelimiterMatch[1].trim();
        // Remove trailing suffixes like ", LL" (truncated LLC) or ", IN" (truncated INC)
        nameToClean = nameToClean.replace(/,\s*[A-Z]{1,3}$/i, "").trim();
    }

    // 1. Check known merchant mappings first (try extracted name, then raw)
    for (const { pattern, name } of MERCHANT_MAP) {
        if (pattern.test(nameToClean) || pattern.test(rawName)) {
            return name;
        }
    }

    // 2. Clean up the name (use extracted merchant if available)
    let cleaned = nameToClean;

    // Remove noise patterns
    for (const pattern of NOISE_PATTERNS) {
        cleaned = cleaned.replace(pattern, " ");
    }

    // Trim and collapse whitespace
    cleaned = cleaned.trim().replace(/\s+/g, " ");

    // 3. Title case the result
    if (cleaned.length > 0) {
        cleaned = cleaned
            .toLowerCase()
            .split(" ")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }

    return cleaned || rawName;
}

/**
 * Gets a display-friendly merchant name from a transaction object.
 * Prefers merchant_name, falls back to name, then merchant field.
 */
export function getDisplayMerchant(tx: {
    merchant_name?: string;
    name?: string;
    merchant?: string;
}): string {
    const raw = tx.merchant_name || tx.name || tx.merchant || "";
    return cleanMerchantName(raw);
}
