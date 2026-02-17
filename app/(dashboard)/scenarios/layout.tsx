import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Scenario Planner",
};

export default function ScenariosLayout({ children }: { children: React.ReactNode }) {
    return children;
}
