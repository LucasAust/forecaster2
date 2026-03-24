'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function Navbar() {
  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 p-6 md:p-8 flex justify-between items-start pointer-events-none mix-blend-difference text-white"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Brand - Left */}
      <div className="pointer-events-auto">
        <Link href="/login" className="font-black text-xl md:text-2xl uppercase tracking-tighter leading-none block text-white">
          Arc<br />Predict&reg;
        </Link>
        <div className="text-[10px] uppercase font-mono mt-1 text-slate-300">
            System v2.5.0
        </div>
      </div>

      {/* Menu - Right (Brutalist List) */}
      <div className="pointer-events-auto hidden md:flex flex-col items-end gap-1">
          {['Models', 'Intelligence', 'Company', 'Access'].map((item, i) => (
            <Link 
                key={item} 
                href="/login"
                className="font-mono text-xs uppercase tracking-widest text-slate-300 hover:text-blue-400 transition-colors"
            >
              / 0{i+1} — {item}
            </Link>
          ))}
          
          <Link href="/login" className="mt-4 border border-white px-4 py-2 font-mono text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-colors text-center">
            GET YOUR BUDGET
          </Link>
      </div>
      
       {/* Mobile Menu Icon */}
        <Link href="/login" className="pointer-events-auto md:hidden font-mono text-xs uppercase border border-white px-3 py-1 bg-black text-white">
            Menu +
        </Link>

    </motion.nav>
  );
}
