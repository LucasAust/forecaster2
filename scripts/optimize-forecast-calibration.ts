import { runRealAudit } from "./audit-forecast-real";

type KnobSet = {
    checkDenseHigh: number;
    checkDenseLow: number;
    cashoutExpectedMult: number;
    cashoutStaleMult: number;
    cashoutCapMax: number;
    cashoutCapSlope: number;
    cashoutAmountCapMult: number;
    sourceDensityBase: number;
    sourceDensitySlope: number;
    sourceDensityMax: number;
    otherDenseMult: number;
    otherStaleMult: number;
    miscCheckWeight: number;
    miscOtherWeight: number;
    miscRecentBoost: number;
    miscCap: number;
};

type EvalResult = {
    knobs: KnobSet;
    avgExpenseErr: number;
    avgIncomeErr: number;
    avgNetAbsErr: number;
    avgCoverage: number;
    score: number;
};

function applyKnobs(knobs: KnobSet): void {
    process.env.ARC_CAL_CHECK_DENSE_HIGH = String(knobs.checkDenseHigh);
    process.env.ARC_CAL_CHECK_DENSE_LOW = String(knobs.checkDenseLow);
    process.env.ARC_CAL_CASHOUT_EXPECTED_MULT = String(knobs.cashoutExpectedMult);
    process.env.ARC_CAL_CASHOUT_STALE_MULT = String(knobs.cashoutStaleMult);
    process.env.ARC_CAL_CASHOUT_CAP_MAX = String(knobs.cashoutCapMax);
    process.env.ARC_CAL_CASHOUT_CAP_SLOPE = String(knobs.cashoutCapSlope);
    process.env.ARC_CAL_CASHOUT_AMOUNT_CAP_MULT = String(knobs.cashoutAmountCapMult);
    process.env.ARC_CAL_SOURCE_DENSITY_BASE = String(knobs.sourceDensityBase);
    process.env.ARC_CAL_SOURCE_DENSITY_SLOPE = String(knobs.sourceDensitySlope);
    process.env.ARC_CAL_SOURCE_DENSITY_MAX = String(knobs.sourceDensityMax);
    process.env.ARC_CAL_OTHER_DENSE_MULT = String(knobs.otherDenseMult);
    process.env.ARC_CAL_OTHER_STALE_MULT = String(knobs.otherStaleMult);
    process.env.ARC_CAL_MISC_CHECK_WEIGHT = String(knobs.miscCheckWeight);
    process.env.ARC_CAL_MISC_OTHER_WEIGHT = String(knobs.miscOtherWeight);
    process.env.ARC_CAL_MISC_RECENT_BOOST = String(knobs.miscRecentBoost);
    process.env.ARC_CAL_MISC_CAP = String(knobs.miscCap);
}

function getEnvNum(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function objective(avgExpenseErr: number, avgIncomeErr: number, avgNetAbsErr: number): number {
    const incomeTarget = getEnvNum("ARC_OPT_INCOME_TARGET", 64.0);
    const expenseTarget = getEnvNum("ARC_OPT_EXPENSE_TARGET", 48.0);
    const incomePenaltyWeight = getEnvNum("ARC_OPT_INCOME_PENALTY", 140);
    const expensePenaltyWeight = getEnvNum("ARC_OPT_EXPENSE_PENALTY", 60);

    const incomePenalty = Math.max(0, avgIncomeErr - incomeTarget) * incomePenaltyWeight;
    const expensePenalty = Math.max(0, avgExpenseErr - expenseTarget) * expensePenaltyWeight;
    return avgNetAbsErr + incomePenalty + expensePenalty;
}

function objectiveFromSummary(summary: ReturnType<typeof runRealAudit>): number {
    const useCoreMetric = getEnvNum("ARC_OPT_USE_CORE_METRIC", 1) >= 0.5;
    const evalExpense = useCoreMetric ? summary.coreAvgExpenseErr : summary.avgExpenseErr;
    const evalIncome = useCoreMetric ? summary.coreAvgIncomeErr : summary.avgIncomeErr;
    const evalNet = useCoreMetric ? summary.coreAvgNetAbsErr : summary.avgNetAbsErr;
    const base = objective(evalExpense, evalIncome, evalNet);

    const sourceMinActual = getEnvNum("ARC_OPT_SOURCE_MIN_ACTUAL", 500);
    const sourcePenaltyWeight = getEnvNum("ARC_OPT_SOURCE_PENALTY", 4);
    const worstMonthWeight = getEnvNum("ARC_OPT_WORST_MONTH_PENALTY", 0.04);

    const sourceRows = summary.sourceRows.filter((row) => row.actual >= sourceMinActual);
    const sourceActualTotal = sourceRows.reduce((sum, row) => sum + row.actual, 0);
    const weightedSourceErr = sourceActualTotal > 0
        ? sourceRows.reduce((sum, row) => sum + (row.errPct * (row.actual / sourceActualTotal)), 0)
        : 0;

    const worstMonthNetAbsErr = summary.rows.reduce((worst, row) => Math.max(worst, row.netAbsErr), 0);

    return base + (weightedSourceErr * sourcePenaltyWeight) + (worstMonthNetAbsErr * worstMonthWeight);
}

function* grid(): Generator<KnobSet> {
    const checkDenseHigh = [1.1];
    const checkDenseLow = [0.86, 0.88];
    const cashoutExpectedMult = [0.28, 0.3];
    const cashoutStaleMult = [0.18, 0.2];
    const cashoutCapMax = [2];
    const cashoutCapSlope = [0.35, 0.4, 0.45];
    const cashoutAmountCapMult = [1.1];
    const sourceDensityBase = [0.68, 0.72, 0.76];
    const sourceDensitySlope = [0.16, 0.2, 0.24];
    const sourceDensityMax = [1.1, 1.25, 1.4];
    const otherDenseMult = [1.1];
    const otherStaleMult = [0.72, 0.74];
    const miscCheckWeight = [0.55];
    const miscOtherWeight = [0.28, 0.32];
    const miscRecentBoost = [0.1, 0.12];
    const miscCap = [6];

    for (const ch of checkDenseHigh)
        for (const cl of checkDenseLow)
            for (const ce of cashoutExpectedMult)
                for (const cs of cashoutStaleMult)
                    for (const ccmax of cashoutCapMax)
                        for (const ccslope of cashoutCapSlope)
                            for (const camt of cashoutAmountCapMult)
                                for (const sdBase of sourceDensityBase)
                                    for (const sdSlope of sourceDensitySlope)
                                        for (const sdMax of sourceDensityMax)
                                            for (const od of otherDenseMult)
                                                for (const os of otherStaleMult)
                                                    for (const mc of miscCheckWeight)
                                                        for (const mo of miscOtherWeight)
                                                            for (const mr of miscRecentBoost)
                                                                for (const cap of miscCap)
                                                                    yield {
                                                                        checkDenseHigh: ch,
                                                                        checkDenseLow: cl,
                                                                        cashoutExpectedMult: ce,
                                                                        cashoutStaleMult: cs,
                                                                        cashoutCapMax: ccmax,
                                                                        cashoutCapSlope: ccslope,
                                                                        cashoutAmountCapMult: camt,
                                                                        sourceDensityBase: sdBase,
                                                                        sourceDensitySlope: sdSlope,
                                                                        sourceDensityMax: sdMax,
                                                                        otherDenseMult: od,
                                                                        otherStaleMult: os,
                                                                        miscCheckWeight: mc,
                                                                        miscOtherWeight: mo,
                                                                        miscRecentBoost: mr,
                                                                        miscCap: cap,
                                                                    };
}

function main(): void {
    process.env.ARC_OPT_INCOME_TARGET = process.env.ARC_OPT_INCOME_TARGET || "64.0";
    process.env.ARC_OPT_EXPENSE_TARGET = process.env.ARC_OPT_EXPENSE_TARGET || "48.0";
    process.env.ARC_OPT_INCOME_PENALTY = process.env.ARC_OPT_INCOME_PENALTY || "140";
    process.env.ARC_OPT_EXPENSE_PENALTY = process.env.ARC_OPT_EXPENSE_PENALTY || "60";
    process.env.ARC_OPT_SOURCE_MIN_ACTUAL = process.env.ARC_OPT_SOURCE_MIN_ACTUAL || "500";
    process.env.ARC_OPT_SOURCE_PENALTY = process.env.ARC_OPT_SOURCE_PENALTY || "4";
    process.env.ARC_OPT_WORST_MONTH_PENALTY = process.env.ARC_OPT_WORST_MONTH_PENALTY || "0.04";
    process.env.ARC_OPT_USE_CORE_METRIC = process.env.ARC_OPT_USE_CORE_METRIC || "1";

    const baseline = runRealAudit();
    const baselineScore = objectiveFromSummary(baseline);

    console.log("\nOptimizing forecast calibration...");
    console.log(`Baseline: expense=${baseline.avgExpenseErr.toFixed(1)}% income=${baseline.avgIncomeErr.toFixed(1)}% net=$${baseline.avgNetAbsErr.toFixed(0)} score=${baselineScore.toFixed(1)}`);
    console.log(`Baseline core-only: expense=${baseline.coreAvgExpenseErr.toFixed(1)}% income=${baseline.coreAvgIncomeErr.toFixed(1)}% net=$${baseline.coreAvgNetAbsErr.toFixed(0)} (coreMonths=${baseline.coreMonthCount}, shockMonths=${baseline.shockMonthCount}, threshold=$${baseline.shockIncomeCreditThreshold.toFixed(0)})`);
    console.log(`Objective targets: income<=${process.env.ARC_OPT_INCOME_TARGET}% expense<=${process.env.ARC_OPT_EXPENSE_TARGET}%`);
    console.log(`Objective mode: ${process.env.ARC_OPT_USE_CORE_METRIC === "1" ? "core-month metrics" : "all-month metrics"}`);

    const tried: EvalResult[] = [];
    let count = 0;

    for (const knobs of grid()) {
        applyKnobs(knobs);
        const summary = runRealAudit();
        const score = objectiveFromSummary(summary);

        tried.push({
            knobs,
            avgExpenseErr: summary.avgExpenseErr,
            avgIncomeErr: summary.avgIncomeErr,
            avgNetAbsErr: summary.avgNetAbsErr,
            avgCoverage: summary.avgCoverage,
            score,
        });

        count++;
        if (count % 40 === 0) {
            const bestSoFar = [...tried].sort((a, b) => a.score - b.score)[0];
            console.log(`Tried ${count} sets. Best so far: score=${bestSoFar.score.toFixed(1)} net=$${bestSoFar.avgNetAbsErr.toFixed(0)} income=${bestSoFar.avgIncomeErr.toFixed(1)}%`);
        }
    }

    const top = [...tried].sort((a, b) => a.score - b.score).slice(0, 8);

    console.log("\nTop calibration candidates:");
    console.table(top.map((r, i) => ({
        rank: i + 1,
        score: r.score.toFixed(1),
        expMAPE: `${r.avgExpenseErr.toFixed(1)}%`,
        incMAPE: `${r.avgIncomeErr.toFixed(1)}%`,
        netAbsErr: `$${r.avgNetAbsErr.toFixed(0)}`,
        cashExp: r.knobs.cashoutExpectedMult,
        cashStale: r.knobs.cashoutStaleMult,
        cashCapMax: r.knobs.cashoutCapMax,
        cashCapSlope: r.knobs.cashoutCapSlope,
        cashAmtCap: r.knobs.cashoutAmountCapMult,
        srcBase: r.knobs.sourceDensityBase,
        srcSlope: r.knobs.sourceDensitySlope,
        srcMax: r.knobs.sourceDensityMax,
        checkDenseHigh: r.knobs.checkDenseHigh,
        checkDenseLow: r.knobs.checkDenseLow,
        otherDense: r.knobs.otherDenseMult,
        otherStale: r.knobs.otherStaleMult,
        miscCheckW: r.knobs.miscCheckWeight,
        miscOtherW: r.knobs.miscOtherWeight,
        miscBoost: r.knobs.miscRecentBoost,
        miscCap: r.knobs.miscCap,
    })));

    const best = top[0];
    console.log("\nBest knob set (export these env vars to reproduce):");
    console.log(`ARC_CAL_CHECK_DENSE_HIGH=${best.knobs.checkDenseHigh}`);
    console.log(`ARC_CAL_CHECK_DENSE_LOW=${best.knobs.checkDenseLow}`);
    console.log(`ARC_CAL_CASHOUT_EXPECTED_MULT=${best.knobs.cashoutExpectedMult}`);
    console.log(`ARC_CAL_CASHOUT_STALE_MULT=${best.knobs.cashoutStaleMult}`);
    console.log(`ARC_CAL_CASHOUT_CAP_MAX=${best.knobs.cashoutCapMax}`);
    console.log(`ARC_CAL_CASHOUT_CAP_SLOPE=${best.knobs.cashoutCapSlope}`);
    console.log(`ARC_CAL_CASHOUT_AMOUNT_CAP_MULT=${best.knobs.cashoutAmountCapMult}`);
    console.log(`ARC_CAL_SOURCE_DENSITY_BASE=${best.knobs.sourceDensityBase}`);
    console.log(`ARC_CAL_SOURCE_DENSITY_SLOPE=${best.knobs.sourceDensitySlope}`);
    console.log(`ARC_CAL_SOURCE_DENSITY_MAX=${best.knobs.sourceDensityMax}`);
    console.log(`ARC_CAL_OTHER_DENSE_MULT=${best.knobs.otherDenseMult}`);
    console.log(`ARC_CAL_OTHER_STALE_MULT=${best.knobs.otherStaleMult}`);
    console.log(`ARC_CAL_MISC_CHECK_WEIGHT=${best.knobs.miscCheckWeight}`);
    console.log(`ARC_CAL_MISC_OTHER_WEIGHT=${best.knobs.miscOtherWeight}`);
    console.log(`ARC_CAL_MISC_RECENT_BOOST=${best.knobs.miscRecentBoost}`);
    console.log(`ARC_CAL_MISC_CAP=${best.knobs.miscCap}`);
}

main();
