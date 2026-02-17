"use client";

import { X, Tag, Calendar, DollarSign, CreditCard, FileText, MapPin, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getDisplayMerchant } from "@/lib/merchants";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/categories";
import { useState, useEffect } from "react";

import type { DisplayTransaction } from "@/types";

interface TransactionDrawerProps {
    transaction: DisplayTransaction | null;
    onClose: () => void;
    onCategoryChange?: (tx: DisplayTransaction, newCategory: string) => void;
}

export function TransactionDrawer({ transaction, onClose, onCategoryChange }: TransactionDrawerProps) {
    const [notes, setNotes] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [editingCategory, setEditingCategory] = useState(false);

    // Reset local state when transaction changes
    useEffect(() => {
        setNotes("");
        setTags([]);
        setEditingCategory(false);
    }, [transaction]);

    const handleAddTag = () => {
        const tag = tagInput.trim();
        if (tag && !tags.includes(tag)) {
            setTags([...tags, tag]);
            setTagInput("");
        }
    };

    const handleRemoveTag = (tag: string) => {
        setTags(tags.filter((t) => t !== tag));
    };

    return (
        <AnimatePresence>
            {transaction && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-zinc-800 bg-zinc-950 shadow-2xl overflow-y-auto"
                    >
                        {/* Header */}
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm px-6 py-4">
                            <h2 className="text-lg font-semibold text-white">Transaction Details</h2>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                                title="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Merchant & Amount */}
                            <div className="text-center">
                                <div className={`inline-flex items-center justify-center h-14 w-14 rounded-full mb-3 ${
                                    transaction.amount > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                                }`}>
                                    <DollarSign size={24} />
                                </div>
                                <h3 className="text-xl font-bold text-white">{getDisplayMerchant(transaction)}</h3>
                                <p className={`mt-1 text-2xl font-bold ${
                                    transaction.amount > 0 ? "text-emerald-400" : "text-rose-400"
                                }`}>
                                    {transaction.amount > 0 ? "+" : "−"}${Math.abs(transaction.amount).toFixed(2)}
                                </p>
                                {transaction.type === "predicted" && (
                                    <span className="mt-2 inline-block rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
                                        Predicted Transaction
                                    </span>
                                )}
                            </div>

                            {/* Details Grid */}
                            <div className="space-y-3">
                                <DetailRow
                                    icon={<Calendar size={16} />}
                                    label="Date"
                                    value={new Date(transaction.date).toLocaleDateString("en-US", {
                                        weekday: "long", year: "numeric", month: "long", day: "numeric"
                                    })}
                                />
                                {/* Editable Category */}
                                <div className="flex items-center gap-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50 p-3">
                                    <div className="text-zinc-500"><Tag size={16} /></div>
                                    <div className="flex-1">
                                        <p className="text-xs text-zinc-500">Category</p>
                                        {editingCategory ? (
                                            <div className="grid grid-cols-2 gap-1 mt-1 max-h-[200px] overflow-y-auto">
                                                {CATEGORIES.map((cat) => {
                                                    const currentCat = Array.isArray(transaction.category) ? transaction.category[0] : transaction.category;
                                                    const isSelected = currentCat === cat;
                                                    return (
                                                        <button
                                                            type="button"
                                                            key={cat}
                                                            onClick={() => {
                                                                onCategoryChange?.(transaction, cat);
                                                                setEditingCategory(false);
                                                            }}
                                                            className={`text-left rounded px-2 py-1 text-xs transition-colors ${
                                                                isSelected
                                                                    ? "bg-blue-500/20 text-blue-400"
                                                                    : "text-zinc-300 hover:bg-zinc-800"
                                                            }`}
                                                        >
                                                            <span
                                                                className="inline-block h-2 w-2 rounded-full mr-1.5"
                                                                style={{ backgroundColor: CATEGORY_COLORS[cat] || "#71717a" }}
                                                            />
                                                            {cat}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setEditingCategory(true)}
                                                className="flex items-center gap-1.5 text-sm font-medium text-white hover:text-blue-400 transition-colors group"
                                            >
                                                <span
                                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                                    style={{ backgroundColor: CATEGORY_COLORS[Array.isArray(transaction.category) ? transaction.category[0] : (transaction.category ?? "")] || "#71717a" }}
                                                />
                                                {Array.isArray(transaction.category) ? transaction.category[0] : (transaction.category || "Uncategorized")}
                                                <ChevronDown size={12} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <DetailRow
                                    icon={<CreditCard size={16} />}
                                    label="Running Balance"
                                    value={`$${transaction.balance?.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                                />
                                {transaction.merchant_name && transaction.merchant_name !== getDisplayMerchant(transaction) && (
                                    <DetailRow
                                        icon={<FileText size={16} />}
                                        label="Original Name"
                                        value={transaction.merchant_name || transaction.name || "N/A"}
                                    />
                                )}
                                {transaction.location && (transaction.location.city || transaction.location.region) && (
                                    <DetailRow
                                        icon={<MapPin size={16} />}
                                        label="Location"
                                        value={[transaction.location.city, transaction.location.region].filter(Boolean).join(", ")}
                                    />
                                )}
                            </div>

                            {/* Tags */}
                            <div>
                                <label className="text-sm font-medium text-zinc-400 mb-2 block">Tags</label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400"
                                        >
                                            {tag}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveTag(tag)}
                                                className="ml-1 hover:text-white transition-colors"
                                                title={`Remove ${tag}`}
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Add a tag..."
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddTag}
                                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="text-sm font-medium text-zinc-400 mb-2 block">Notes</label>
                                <textarea
                                    placeholder="Add a note about this transaction..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none resize-none"
                                />
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50 p-3">
            <div className="text-zinc-500">{icon}</div>
            <div className="flex-1">
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="text-sm font-medium text-white">{value}</p>
            </div>
        </div>
    );
}
