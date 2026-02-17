import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Budget Tracker",
};

export default function BudgetLayout({ children }: { children: React.ReactNode }) {
    return children;
}
