/** Core domain types for Arc Predict */

// ─── Plaid / Transaction Types ──────────────────────────────

export interface PlaidAccount {
    account_id: string;
    name: string;
    official_name: string | null;
    type: 'depository' | 'credit' | 'loan' | 'investment' | 'brokerage' | 'other';
    subtype: string | null;
    mask: string | null;
    balances: {
        available: number | null;
        current: number | null;
        limit: number | null;
        iso_currency_code: string | null;
    };
}

export interface Transaction {
    transaction_id: string;
    user_id?: string;
    account_id: string;
    amount: number; // Plaid convention: positive = expense, negative = income
    date: string; // YYYY-MM-DD
    authorized_date?: string; // YYYY-MM-DD
    name: string;
    merchant_name?: string;
    category: string[] | string | null;
    pending: boolean;
    logo_url: string | null;
    /** True for predicted (AI-forecasted) transactions */
    isPredicted?: boolean;
}

// ─── Forecast Types ─────────────────────────────────────────

export interface PredictedTransaction {
    date: string; // YYYY-MM-DD
    day_of_week: string;
    merchant: string;
    name?: string;
    amount: number; // Negative = expense, Positive = income (AI convention)
    category: string;
    type: 'expense' | 'income';
    confidence_score: 'high' | 'medium' | 'low';
}

export interface Forecast {
    forecast_period_days: number;
    predicted_transactions: PredictedTransaction[];
}

export interface ForecastTimelinePoint {
    day: string;
    fullDate: string;
    balance: number;
    income: number;
    expenses: number;
    dailyIncome: number;
    dailyExpenses: number;
    transactions: PredictedTransaction[];
}

// ─── AI Suggestion Types ────────────────────────────────────

export interface AISuggestion {
    title: string;
    message: string;
    type: 'saving' | 'warning' | 'insight';
}

// ─── User Settings ──────────────────────────────────────────

export interface UserSettings {
    user_id: string;
    monthly_budget: number;
    display_name: string | null;
    /** JSON blob for user preferences (dashboard layout, category limits, etc.) */
    user_preferences: UserPreferences | null;
    created_at?: string;
    updated_at?: string;
}

export interface UserPreferences {
    dashboard_layout?: WidgetConfig[];
    category_limits?: CategoryLimit[];
    savings_goals?: SavingsGoal[];
    saved_scenarios?: SavedScenario[];
    debt_plans?: DebtEntry[];
    spending_challenges?: SpendingChallengeState;
    income_allocations?: { needs: number; wants: number; savings: number };
}

// ─── Dashboard Layout ───────────────────────────────────────

export interface WidgetConfig {
    id: string;
    label: string;
    visible: boolean;
    order: number;
}

// ─── Budget Types ───────────────────────────────────────────

export interface CategoryLimit {
    category: string;
    limit: number;
    rollover: boolean;
}

// ─── Savings Goals ──────────────────────────────────────────

export interface SavingsGoal {
    id: string;
    name: string;
    target: number;
    saved: number;
    color: string;
    deadline?: string;
}

// ─── Scenario Types ─────────────────────────────────────────

export interface SavedScenario {
    id: string;
    label: string;
    prompt: string;
}

export interface ScenarioStats {
    endingBalance: number;
    lowestPoint: number;
    change: string;
    lowestChange: string;
    isHealthy: boolean;
}

// ─── Chat Types ─────────────────────────────────────────────

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

// ─── Debt Planner Types ─────────────────────────────────────

export interface DebtEntry {
    id: string;
    name: string;
    balance: number;
    apr: number;
    minPayment: number;
}

// ─── Spending Challenges ────────────────────────────────────

export interface SpendingChallenge {
    id: string;
    name: string;
    description: string;
    type: 'no-spend' | 'limit';
    category?: string;
    dailyLimit?: number;
    durationDays: number;
    startDate: string;
    active: boolean;
}

export interface SpendingChallengeState {
    activeChallenges: SpendingChallenge[];
    badges: string[];
}

// ─── Display Transaction (unified row for tables/charts) ────

export interface DisplayTransaction {
    transaction_id?: string;
    account_id?: string;
    amount: number; // Normalized: negative = expense, positive = income
    date: string;
    name?: string;
    merchant?: string;
    merchant_name?: string;
    category: string[] | string | null;
    pending?: boolean;
    logo_url?: string | null;
    type: 'actual' | 'predicted';
    dateObj: Date;
    balance?: number;
    confidence_score?: string;
    day_of_week?: string;
    location?: {
        city?: string;
        region?: string;
    };
}

/** Row shape used for CSV/JSON export */
export interface ExportRow {
    date: string;
    merchant: string;
    category: string;
    amount: number;
    balance: number;
    type: string;
}

/** Budget histogram category bucket */
export interface CategoryBucket {
    name: string;
    thisMonth: number;
    lastMonth: number;
}

// ─── Notification Types ─────────────────────────────────────

export interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'error';
    read: boolean;
    createdAt: string;
}

// ─── MFA Types ──────────────────────────────────────────────

export interface MfaFactor {
    id: string;
    factor_type: 'totp' | 'phone' | 'webauthn';
    friendly_name?: string | null;
    status: 'verified' | 'unverified';
    created_at: string;
    updated_at: string;
}

// ─── Transaction Clarification Types ───────────────────────

export interface ClarificationQuestion {
    transaction_id: string;
    transaction_name: string;
    amount: number;
    date: string;
    question: string;
    options: string[];
    /** Parallel array to options: which category each option maps to */
    category_mappings: string[];
}

export interface ClarificationAnswer {
    transaction_id: string;
    category: string;
}

// ─── Sync Context Types ─────────────────────────────────────

export type LoadingStage = 'idle' | 'transactions' | 'forecast' | 'complete';

export interface SyncState {
    isSyncing: boolean;
    syncProgress: number;
    lastUpdated: Date | null;
    triggerUpdate: (options?: { retryOnEmpty?: boolean }) => Promise<void>;
    transactions: Transaction[];
    forecast: Forecast | null;
    balance: number;
    accounts: PlaidAccount[];
    loadingStage: LoadingStage;
    error: string | null;
    /** Non-blocking warning when the forecast model fails but transactions loaded OK */
    forecastError: string | null;
    /** True when at least one Plaid item is linked, even if transactions haven't arrived yet */
    hasLinkedBank: boolean;
    /** Questions to ask user after a fresh bank connection (up to 5) */
    pendingClarifications: ClarificationQuestion[];
    /** Submit user's answers, save to DB, re-run forecast */
    submitClarifications: (answers: ClarificationAnswer[]) => Promise<void>;
    /** Dismiss clarifications without answering */
    dismissClarifications: () => void;
}
