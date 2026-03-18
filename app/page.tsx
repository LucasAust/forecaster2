"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, Building2, MessageCircleQuestion, ArrowRight, Wallet } from "lucide-react";

const features = [
  {
    icon: TrendingUp,
    title: "Smart Forecasting",
    description:
      "AI predicts your finances 90 days ahead — balances, spending patterns, and upcoming crunches before they hit.",
  },
  {
    icon: Building2,
    title: "Bank Connected",
    description:
      "Securely link your accounts with Plaid. Real-time data, bank-level encryption, zero manual entry.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Insight Questions",
    description:
      "Arc learns from you. Answer quick questions and the AI adapts its predictions to your real life.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 * i, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center bg-zinc-950 overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-gradient-to-br from-blue-600/20 to-violet-600/20 blur-3xl" />

      {/* Nav */}
      <header className="relative z-10 flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">Arc</span>
        </div>
        <Link
          href="/login"
          className="rounded-lg bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-300 ring-1 ring-zinc-700 transition-all hover:bg-zinc-700 hover:text-white"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-12 text-center">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0}
          className="mb-4"
        >
          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400 ring-1 ring-blue-500/20">
            AI-Powered Financial Forecasting
          </span>
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={1}
          className="max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
        >
          Predict your financial{" "}
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            future
          </span>{" "}
          with AI
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={2}
          className="mt-6 max-w-lg text-base text-zinc-400 sm:text-lg"
        >
          Connect your bank, answer a few questions, and Arc forecasts your
          balances, spending, and cash flow up to 90 days out.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={3}
          className="mt-10"
        >
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:brightness-110"
          >
            Get Started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>

        {/* Feature cards */}
        <div className="mt-24 grid w-full max-w-4xl gap-6 sm:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={i + 4}
              className="group rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-6 text-left backdrop-blur-sm transition-colors hover:border-zinc-700/60 hover:bg-zinc-900/60"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600/20 to-violet-600/20 ring-1 ring-white/5">
                <feature.icon className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-zinc-800/60 py-6 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} Arc Predict. All rights reserved.
      </footer>
    </div>
  );
}
