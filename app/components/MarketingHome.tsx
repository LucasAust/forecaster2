'use client';

import Link from "next/link";
import Scene from "./Scene";
import Navbar from "./Navbar";
import SmoothScroll from "./SmoothScroll";
import { ArrowRight, Radio, Check, X, TrendingUp, Zap, Shield, Activity, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { useRef } from "react";

export default function Home() {
  const containerRef = useRef(null);
  
  return (
        <SmoothScroll>
        <main ref={containerRef} className="relative w-full bg-white text-slate-900 overflow-hidden cursor-crosshair">
        <Navbar />
        
        {/* === HERO SECTION === */}
        <section className="relative h-screen flex flex-col justify-center px-6 md:px-12 pt-24 overflow-hidden">
            
            {/* The 3D Scene - FORCED z-index 0, Absolute, Full coverage */}
            <div className="absolute top-0 left-0 w-full h-full z-0 block">
                 <Scene /> 
            </div>

            <div className="relative z-10 w-full max-w-[1400px] mx-auto pointer-events-none flex flex-col items-start justify-center h-full">
                
                {/* Glass Panel for Readability - Shrunk & More Transparent - RESPONSIVE PADDING */}
                <div className="pointer-events-auto p-6 md:p-8 md:pr-12 rounded-[2rem] bg-white/10 backdrop-blur-[2px] border border-white/20 shadow-sm max-w-full md:max-w-[500px] lg:max-w-none lg:w-fit">
                    
                    {/* Micro-interaction Label */}
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="flex items-center gap-2 mb-4 font-mono text-xs uppercase tracking-[0.2em] text-slate-600"
                    >
                        <span className="w-2 h-2 bg-blue-600 animate-pulse rounded-full shadow-[0_0_10px_rgba(37,99,235,0.5)]"></span>
                        Predictive Intelligence
                    </motion.div>

                    {/* Massive Typo */}
                    <h1 className="text-3xl sm:text-6xl md:text-7xl font-black leading-[0.9] tracking-tighter uppercase text-slate-900 relative z-20 break-words w-full">
                        <motion.span 
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                            className="block lg:inline-block lg:mr-4"
                        >
                            Stop
                        </motion.span>
                        <motion.span 
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                            className="block lg:inline-block lg:mr-4"
                        >
                            Guessing
                        </motion.span>
                        <motion.span 
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="block lg:inline-block text-blue-600 drop-shadow-sm"
                        >
                            Start Knowing
                        </motion.span>
                    </h1>

                    {/* Description text */}
                    <div className="mt-8 md:max-w-xl">
                        <motion.p 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.8 }}
                            className="font-mono text-sm leading-relaxed text-slate-700 border-l-2 border-blue-600 pl-6"
                        >
                            Most budgets show you the past. Arc Predict shows you what's coming. See every bill, every paycheck, every surprise—before it happens.
                        </motion.p>
                        
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1 }}
                            className="mt-8"
                        >
                            <Link href="/forecast" className="group relative px-8 py-4 bg-slate-900 text-white font-mono text-xs font-bold uppercase tracking-widest overflow-hidden hover:scale-105 transition-transform shadow-lg inline-block">
                                <span className="relative z-10 flex items-center gap-2">
                                    Get Your Budget <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </span>
                                <div className="absolute inset-0 bg-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500 ease-out"></div>
                            </Link>
                        </motion.div>
                    </div>
                </div>
            </div>
            
            {/* Scroll Indicator */}
            <div className="absolute bottom-12 left-6 md:left-12 flex items-center gap-4 font-mono text-[10px] uppercase text-slate-400">
                <div className="h-[1px] w-12 bg-slate-300"></div>
                Scroll to Explore
            </div>
        </section>

        {/* === TICKER / MARQUEE === */}
        <div className="w-full bg-blue-600 text-white py-4 overflow-hidden border-y border-white relative z-20">
             <div className="flex w-max whitespace-nowrap animate-marquee font-display font-black text-4xl md:text-6xl uppercase tracking-tighter">
                <span className="px-4">/// STOP GUESSING. START KNOWING. /// YOUR FINANCIAL FUTURE, TODAY. /// PREDICTIVE INTELLIGENCE /// SEE EVERY BILL, EVERY PAYCHECK. ///</span>
                <span className="px-4">/// STOP GUESSING. START KNOWING. /// YOUR FINANCIAL FUTURE, TODAY. /// PREDICTIVE INTELLIGENCE /// SEE EVERY BILL, EVERY PAYCHECK. ///</span>
             </div>
        </div>

        {/* === FEATURE 1: DASHBOARD PREVIEW === */}
        <section className="py-32 px-6 md:px-12 relative z-10 bg-slate-50 overflow-hidden">
             {/* Background decoration */}
             <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100 rounded-full blur-[100px] opacity-50 pointer-events-none translate-x-1/2 -translate-y-1/2"></div>

             <div className="flex flex-col md:flex-row justify-between items-end mb-20 border-b border-slate-200 pb-6 relative z-10">
                <div>
                    <div className="flex items-center gap-2 font-mono text-xs text-blue-600 mb-2 uppercase tracking-[0.2em]">
                        <Zap className="w-3 h-3" /> Predictive Intelligence
                    </div>
                    <h2 className="text-fluid-h2 font-bold max-w-3xl text-slate-900 leading-[0.9]">
                        YOUR FINANCIAL <br/><span className="text-slate-400">FUTURE, TODAY.</span>
                    </h2>
                </div>
                <p className="max-w-md text-slate-600 font-mono text-xs md:text-sm mt-8 md:mt-0">
                    Know your balance next week, next month, next year—before you get there. Arc Predict uses intelligent forecasting to show you exactly where your money is headed.
                </p>
            </div>

            {/* Browser Window Mockup */}
            <motion.div 
                initial={{ y: 50, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="w-full rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/10 border border-slate-200 bg-white relative z-10 hover:shadow-3xl transition-shadow duration-500"
            >
                 {/* Browser Chrome */}
                 <div className="h-10 bg-slate-50 border-b border-slate-200 flex items-center px-4 gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400/80"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400/80"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400/80"></div>
                    <div className="ml-4 flex-1 h-6 bg-white border border-slate-200 rounded-md flex items-center px-3">
                        <div className="w-3 h-3 rounded-full bg-slate-200 mr-2"></div>
                        <div className="h-2 w-24 bg-slate-100 rounded-full"></div>
                    </div>
                 </div>

                 {/* App Content */}
                 <div className="p-8 md:p-12 bg-slate-50">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                         {/* Card 1 */}
                         <div className="p-6 rounded-xl bg-white border border-slate-100 shadow-sm group hover:border-blue-100 transition-colors">
                             <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-blue-500 transition-colors">
                                    <Shield className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded">Real-time</span>
                             </div>
                             <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">Current Balance</div>
                             <div className="text-3xl font-mono font-bold text-slate-900">$12,847<span className="text-slate-300">.00</span></div>
                         </div>
                         
                         {/* Card 2 - Active */}
                         <div className="p-6 rounded-xl bg-white border border-blue-500/20 shadow-[0_4px_20px_-10px_rgba(59,130,246,0.2)] relative overflow-hidden">
                             <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-8 -mt-8"></div>
                             <div className="flex justify-between items-start mb-4 relative z-10">
                                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                    <TrendingUp className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] uppercase tracking-widest text-green-600 bg-green-50 px-2 py-1 rounded">+12.4%</span>
                             </div>
                             <div className="text-xs uppercase tracking-widest text-slate-400 mb-1 relative z-10">Predicted (30d)</div>
                             <div className="text-3xl font-mono font-bold text-blue-600 relative z-10">$14,234<span className="text-blue-200">.00</span></div>
                         </div>

                         {/* Card 3 */}
                         <div className="p-6 rounded-xl bg-white border border-slate-100 shadow-sm group hover:border-red-100 transition-colors">
                             <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-red-500 transition-colors">
                                    <Radio className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded">Detected</span>
                             </div>
                             <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">Upcoming Bills</div>
                             <div className="text-3xl font-mono font-bold text-slate-900">-$2,450<span className="text-slate-300">.00</span></div>
                         </div>
                     </div>
                     
                     <div className="relative h-72 w-full bg-white rounded-xl overflow-hidden border border-slate-100 shadow-sm flex items-center justify-center group">
                         {/* Grid Pattern Background */}
                        <div className="grid-pattern-bg absolute inset-0 z-0 opacity-[0.03]">
                         </div>
                         
                         <div className="absolute top-4 left-4 z-10 flex gap-4">
                             <div className="px-3 py-1 rounded-full bg-slate-100 text-[10px] font-mono text-slate-500 uppercase">Cash Flow Velocity</div>
                             <div className="px-3 py-1 rounded-full bg-blue-50 text-[10px] font-mono text-blue-600 uppercase">Projection: Stable</div>
                         </div>

                         {/* Data Points (HTML implementation to avoid aspect ratio distortion) */}
                         <div className="absolute inset-0 z-20 pointer-events-none">
                            {/* Point 1 */}
                            <div className="absolute left-1/2 top-[46.6%] -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-blue-500 rounded-full group-hover:scale-125 transition-transform"></div>
                            {/* Point 2 */}
                            <div className="absolute left-full top-[16.6%] -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-blue-500 rounded-full group-hover:scale-125 transition-transform"></div>
                         </div>

                         {/* Abstract Chart Line */}
                         <svg className="absolute bottom-0 left-0 w-full h-full z-10" viewBox="0 0 900 300" preserveAspectRatio="none">
                             <defs>
                                 <linearGradient id="blue-grade-light" x1="0" y1="0" x2="0" y2="1">
                                     <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.1"/>
                                     <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
                                 </linearGradient>
                             </defs>
                             <path d="M0,200 C150,180 300,220 450,140 S600,160 900,50 L900,300 L0,300 Z" fill="url(#blue-grade-light)" />
                             <path d="M0,200 C150,180 300,220 450,140 S600,160 900,50" fill="none" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                         </svg>
                     </div>
                 </div>
            </motion.div>
        </section>

        {/* === FEATURE 2: COMPARISON === */}
        <section className="py-32 px-6 md:px-12 bg-white relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
                <div className="order-2 md:order-1 relative">
                    {/* Background blob */}
                    <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-slate-100 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2 z-0"></div>

                    {/* Comparison Stack */}
                    <div className="relative z-10 space-y-6">
                        {/* Old Way Card */}
                        <motion.div 
                            initial={{ x: -30, opacity: 0 }}
                            whileInView={{ x: 0, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6 }}
                            className="bg-white rounded-xl shadow-lg border border-slate-100 p-6 flex items-start gap-4 opacity-70 scale-95 origin-left"
                        >
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-400">
                                <X className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 mb-1">Spreadsheets & Manual Entry</h4>
                                <p className="text-sm text-slate-500 leading-relaxed mb-3">Updating 4 different CSV files every Sunday night just to see if you can afford dinner.</p>
                                <div className="flex gap-2">
                                    <div className="h-6 w-20 bg-slate-100 rounded text-[10px] flex items-center justify-center text-slate-400">Manual</div>
                                    <div className="h-6 w-20 bg-slate-100 rounded text-[10px] flex items-center justify-center text-slate-400">Delayed</div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Arrow Connector */}
                        <div className="h-8 border-l-2 border-dashed border-slate-200 ml-11"></div>

                        {/* New Way Card */}
                        <motion.div 
                            initial={{ x: 30, opacity: 0 }}
                            whileInView={{ x: 0, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="bg-white rounded-xl shadow-xl shadow-blue-500/10 border border-blue-100 p-6 flex items-start gap-4 ring-4 ring-blue-50/50"
                        >
                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white shadow-lg shadow-blue-500/30">
                                <Check className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 mb-1">Automated Intelligence</h4>
                                <p className="text-sm text-slate-500 leading-relaxed mb-3">Syncs with 12,000+ banks instantly. Categorizes, predicts, and alerts you without lifting a finger.</p>
                                <div className="flex gap-2">
                                    <div className="h-6 w-20 bg-blue-50 border border-blue-100 rounded text-[10px] flex items-center justify-center text-blue-600 font-medium">Real-time</div>
                                    <div className="h-6 w-20 bg-blue-50 border border-blue-100 rounded text-[10px] flex items-center justify-center text-blue-600 font-medium">Accurate</div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>

                <div className="order-1 md:order-2">
                    <div className="flex items-center gap-2 font-mono text-xs text-blue-600 mb-2 uppercase tracking-[0.2em]">
                        <Activity className="w-3 h-3" /> The Paradigm Shift
                    </div>
                    <h2 className="text-fluid-h2 font-bold mb-6 text-slate-900 leading-[0.9]">
                        STOP LIVING IN <br/> <span className="text-slate-400 line-through decoration-blue-500 decoration-4">SPREADSHEETS</span>.
                    </h2>
                    <p className="text-slate-600 leading-relaxed mb-6 font-light text-lg">
                        The old way of managing finances is reactive. It tells you what happened after it's too late to change it.
                    </p>
                    <p className="text-slate-600 leading-relaxed font-light text-lg">
                        Arc is proactive. It builds a dynamic model of your future finances so you can make decisions today that shape your wealth tomorrow.
                    </p>
                    <div className="mt-8 flex items-center gap-4 text-sm font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-blue-600" /> Bank-grade Security
                        </div>
                        <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-blue-600" /> Read-only Access
                        </div>
                    </div>
                </div>
            </div>
        </section>


        {/* === SOCIAL PROOF === */}
        <section className="py-20 bg-slate-50 border-y border-slate-200">
            <div className="container mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-slate-200">
                <div className="p-4">
                    <div className="text-6xl font-black text-blue-600 mb-2">94%</div>
                    <div className="font-mono text-xs uppercase tracking-widest text-slate-500">Forecast Accuracy</div>
                </div>
                <div className="p-4">
                    <div className="text-6xl font-black text-slate-900 mb-2">10hrs</div>
                    <div className="font-mono text-xs uppercase tracking-widest text-slate-500">Saved Per Month</div>
                </div>
                 <div className="p-4">
                    <div className="text-6xl font-black text-slate-900 mb-2">$340</div>
                    <div className="font-mono text-xs uppercase tracking-widest text-slate-500">Avg Monthly Savings</div>
                </div>
            </div>
        </section>
        
        {/* === CTA / INTEREST FORM === */}
        <section className="py-32 bg-white text-slate-900 relative group overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50 rounded-full blur-[100px] opacity-60 pointer-events-none translate-x-1/2 -translate-y-1/2"></div>
            
            <div className="container mx-auto px-6 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                    <div>
                        <div className="flex items-center gap-2 font-mono text-xs text-blue-600 mb-6 uppercase tracking-[0.2em]">
                            <Zap className="w-3 h-3" /> Join the Revolution
                        </div>
                        <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 leading-[0.9] text-slate-900">
                            READY TO <br/>
                            <span className="text-blue-600">PREDICT?</span>
                        </h2>
                        <p className="text-slate-500 text-lg mb-8 max-w-md font-light leading-relaxed">
                            Stop looking backward at your spending. Start looking forward at your wealth. Join the waitlist for early access.
                        </p>
                        
                        <div className="flex items-center gap-8 text-sm font-mono text-slate-500">
                            
                            <div className="flex items-center gap-2">
                                <Lock className="w-4 h-4 text-blue-600" />
                                <span>Invite Only</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-100 p-8 rounded-2xl shadow-xl shadow-slate-200/50 relative overflow-hidden space-y-5">
                        <h3 className="text-2xl font-bold text-slate-900">Open Your Forecast</h3>
                        <p className="text-slate-500 leading-relaxed">
                            Continue to your forecast workspace. If you are not signed in yet, you will be prompted first.
                        </p>
                        <Link
                            href="/forecast"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-4 text-center font-bold text-white transition-all hover:bg-blue-600"
                        >
                            Go to Forecast Hub
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </div>
        </section>

        {/* === MASSIVE CTA === */}
        <section className="py-32 bg-white text-slate-900 border-t border-slate-100 relative overflow-hidden text-center">
            <div className="container mx-auto px-6 relative z-10">
                 <div className="font-mono text-xs uppercase mb-4 tracking-[0.3em] text-blue-600">Why Wait?</div>
                 <p className="max-w-xl mx-auto text-slate-500 mb-12 font-mono text-sm leading-relaxed">
                    You didn't sign up for a part-time job managing spreadsheets. Get a budget that does the work for you.
                 </p>
                 <Link href="/forecast" className="inline-block group">
                    <h2 className="text-[8vw] leading-none font-black tracking-tighter group-hover:text-blue-600 transition-colors duration-300">
                        GET YOUR BUDGET
                    </h2>
                 </Link>
            </div>
        </section>

        <footer className="bg-slate-50 text-slate-400 py-12 px-6 md:px-12 flex flex-col items-center font-mono text-xs border-t border-slate-200">
             <div className="mb-4 text-center">
                <span className="font-bold text-slate-900 text-lg block mb-4">Arc<span className="text-blue-600">Predict</span></span>
                &copy; 2026 ARC PREDICT INC. <br />
                SAN FRANCISCO / TOKYO / NEW YORK
            </div>
            <div className="w-full text-center mt-4 pt-4 border-t border-slate-200">
                <Link href="/forecast" className="text-blue-600 hover:underline">Go to Forecast Hub</Link>
            </div>
        </footer>
    </main>
    </SmoothScroll>
  );
}
