/**
 * Test insight questions with edge cases:
 * - Empty transaction list
 * - Very few transactions
 * - All answers already provided
 * - Profile builder with various answer combos
 */
import { generateInsightQuestions, buildInsightProfile } from "../lib/insight-questions";
import type { InsightAnswer } from "../lib/insight-questions";
import type { Transaction } from "../types";

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`✅ ${name}`);
    } catch (e: any) {
        console.log(`❌ ${name}: ${e.message}`);
    }
}

function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
}

// Empty transactions → onboarding questions
test("Empty transactions returns onboarding questions", () => {
    const qs = generateInsightQuestions([]);
    assert(qs.length === 2, `Expected 2 onboarding questions, got ${qs.length}`);
    assert(qs[0].layer === "onboarding", "Expected onboarding layer");
    assert(qs[0].id === "income_type", `Expected income_type, got ${qs[0].id}`);
});

// With existing answers, skip answered questions
test("Skips already-answered questions", () => {
    const answered: InsightAnswer[] = [
        { question_id: "income_type", value: "salary", answered_at: new Date().toISOString() },
        { question_id: "recent_changes", value: "stable", answered_at: new Date().toISOString() },
    ];
    const qs = generateInsightQuestions([], answered);
    assert(qs.length === 0, `Expected 0 questions, got ${qs.length}`);
});

// Very few transactions
test("Few transactions still generates some questions", () => {
    const txs: Transaction[] = Array.from({ length: 5 }, (_, i) => ({
        transaction_id: `t${i}`,
        account_id: "test",
        amount: 50,
        date: `2025-01-${String(i + 1).padStart(2, "0")}`,
        name: `Store ${i}`,
        category: null,
        pending: false,
        logo_url: null,
    }));
    const qs = generateInsightQuestions(txs);
    assert(qs.length > 0, "Expected at least 1 question");
    assert(qs.length <= 5, `Expected ≤5 questions, got ${qs.length}`);
});

// Profile builder — all answer types
test("Profile builder handles all answer types", () => {
    const answers: InsightAnswer[] = [
        { question_id: "income_type", value: "salary", answered_at: "" },
        { question_id: "income_expectation", value: "5000", answered_at: "" },
        { question_id: "expense_expectation", value: "3000", answered_at: "" },
        { question_id: "regime_change_expenses", value: "new_normal", answered_at: "" },
        { question_id: "recent_changes", value: "spending_up", answered_at: "" },
    ];
    const p = buildInsightProfile(answers);
    assert(p.income_type === "salary", `Expected salary, got ${p.income_type}`);
    assert(p.expected_monthly_income === 5000, `Expected 5000, got ${p.expected_monthly_income}`);
    assert(p.expected_monthly_expenses === 3000, `Expected 3000, got ${p.expected_monthly_expenses}`);
    assert(p.regime_change_confirmed === true, "Expected regime confirmed");
    assert(p.spending_anchor === "recent", `Expected recent, got ${p.spending_anchor}`);
});

// Profile builder — temporary spike
test("Profile builder: temporary spike → historical anchor", () => {
    const answers: InsightAnswer[] = [
        { question_id: "regime_change_expenses", value: "temporary", answered_at: "" },
    ];
    const p = buildInsightProfile(answers);
    assert(p.regime_change_confirmed === false, "Expected not confirmed");
    assert(p.spending_anchor === "historical", `Expected historical, got ${p.spending_anchor}`);
});

// Profile builder — freelance income
test("Profile builder: freelance income types", () => {
    for (const val of ["freelance", "seasonal"]) {
        const p = buildInsightProfile([{ question_id: "income_pattern", value: val, answered_at: "" }]);
        assert(p.income_type === "freelance", `Expected freelance for ${val}, got ${p.income_type}`);
    }
});

// Profile builder — empty answers
test("Profile builder: empty answers → empty profile", () => {
    const p = buildInsightProfile([]);
    assert(p.income_type === undefined, "Expected undefined income_type");
    assert(p.expected_monthly_income === undefined, "Expected undefined income");
});

// Max 5 questions
test("Never returns more than 5 questions", () => {
    // Create enough data to trigger all detectors
    const txs: Transaction[] = [];
    // 12 months of varied data
    for (let m = 1; m <= 12; m++) {
        for (let d = 1; d <= 20; d++) {
            txs.push({
                transaction_id: `t${m}-${d}`,
                account_id: "test",
                amount: m <= 6 ? 30 : 100, // regime change at month 7
                date: `2025-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
                name: `Store`,
                category: null,
                pending: false,
                logo_url: null,
            });
        }
        // Income
        txs.push({
            transaction_id: `inc${m}`,
            account_id: "test",
            amount: -(1000 + Math.random() * 5000), // variable income
            date: `2025-${String(m).padStart(2, "0")}-15`,
            name: `Employer`,
            category: null,
            pending: false,
            logo_url: null,
        });
    }
    // Big spike
    txs.push({
        transaction_id: "spike1",
        account_id: "test",
        amount: 5000,
        date: "2025-11-01",
        name: "Huge Purchase",
        category: null,
        pending: false,
        logo_url: null,
    });

    const qs = generateInsightQuestions(txs);
    assert(qs.length <= 5, `Expected ≤5, got ${qs.length}`);
    assert(qs.length >= 3, `Expected ≥3, got ${qs.length}`);
});

// All question options have non-empty labels and values
test("All options have valid labels and values", () => {
    const txs: Transaction[] = Array.from({ length: 100 }, (_, i) => ({
        transaction_id: `t${i}`,
        account_id: "test",
        amount: i % 3 === 0 ? -500 : 50 + Math.random() * 200,
        date: `2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
        name: `Merchant ${i % 10}`,
        category: null,
        pending: false,
        logo_url: null,
    }));
    const qs = generateInsightQuestions(txs);
    for (const q of qs) {
        assert(q.options.length >= 2, `Question ${q.id} has <2 options`);
        for (const opt of q.options) {
            assert(opt.label.length > 0, `Empty label in ${q.id}`);
            assert(opt.value.length > 0, `Empty value in ${q.id}`);
        }
    }
});

console.log("\nDone!");
