"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/* ── Fade-in on mount ── */
export function FadeIn({
    children,
    delay = 0,
    duration = 0.4,
    className = "",
    ...props
}: { children: React.ReactNode; delay?: number; duration?: number; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration, delay, ease: "easeOut" }}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    );
}

/* ── Slide up from bottom ── */
export function SlideUp({
    children,
    delay = 0,
    className = "",
}: { children: React.ReactNode; delay?: number; className?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

/* ── Stagger children ── */
export function StaggerChildren({
    children,
    staggerDelay = 0.08,
    className = "",
}: { children: React.ReactNode; staggerDelay?: number; className?: string }) {
    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={{
                hidden: {},
                visible: { transition: { staggerChildren: staggerDelay } },
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

export function StaggerItem({
    children,
    className = "",
}: { children: React.ReactNode; className?: string }) {
    return (
        <motion.div
            variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

/* ── Count-up number animation ── */
export function CountUp({
    value,
    prefix = "",
    suffix = "",
    decimals = 2,
    duration = 1000,
    className = "",
}: {
    value: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    duration?: number;
    className?: string;
}) {
    const [display, setDisplay] = useState(0);
    const prevValue = useRef(0);
    const frameRef = useRef<number>(0);

    useEffect(() => {
        const start = prevValue.current;
        const end = value;
        const startTime = performance.now();

        function tick(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(start + (end - start) * eased);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(tick);
            } else {
                prevValue.current = end;
            }
        }

        frameRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameRef.current);
    }, [value, duration]);

    return (
        <span className={className}>
            {prefix}{display.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
        </span>
    );
}

/* ── Page transition wrapper ── */
export function PageTransition({
    children,
    className = "",
}: { children: React.ReactNode; className?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={className}
        >
            {children}
        </motion.div>
    );
}
