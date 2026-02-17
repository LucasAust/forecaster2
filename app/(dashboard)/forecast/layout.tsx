import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Forecast Hub",
};

export default function ForecastLayout({ children }: { children: React.ReactNode }) {
    return children;
}
