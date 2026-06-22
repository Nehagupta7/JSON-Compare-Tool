import { useState, useCallback, useMemo, useEffect } from "react";
import { useDarkMode } from "../hooks/Usedarkmode";

/**
 * JsonCompare.jsx
 *
 * CSS framework: Tailwind CSS v4 (utility classes only)
 * Setup: see TAILWIND_V4_SETUP.md — requires @import "tailwindcss" and
 *        @variant dark (&:where(.dark, .dark *)); in your global CSS.
 *
 * A standalone JSON-vs-JSON comparison tool:
 *   - Paste two JSON objects (A / B)
 *   - Diff view: side-by-side rows, changed keys highlighted, collapsible nested objects/arrays
 *   - Formatted view: same data as labeled "card" fields instead of raw JSON, for readability
 *   - Expand all / Collapse all
 *   - Dark / light mode toggle (persisted, respects OS preference on first visit)
 *
 * Depends on useDarkMode.js (in the same folder) + React + Tailwind v4.
 */

// ─── Diff utilities ───────────────────────────────────────────────────────────

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function getChangedKeys(before = {}, after = {}) {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const changed = new Set();
    keys.forEach((k) => {
        if (!deepEqual(before?.[k], after?.[k])) changed.add(k);
    });
    return changed;
}

function countChanges(before = {}, after = {}) {
    let count = 0;
    const b = before || {};
    const a = after || {};
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    keys.forEach((k) => {
        const bv = b[k];
        const av = a[k];
        if (deepEqual(bv, av)) return;
        if (Array.isArray(bv) || Array.isArray(av)) {
            const bArr = bv || [];
            const aArr = av || [];
            const len = Math.max(bArr.length, aArr.length);
            for (let i = 0; i < len; i++) {
                const bi = bArr[i], ai = aArr[i];
                if (typeof bi === "object" && bi !== null && typeof ai === "object" && ai !== null) {
                    count += countChanges(bi, ai);
                } else if (!deepEqual(bi, ai)) {
                    count++;
                }
            }
        } else if (typeof bv === "object" && bv !== null && typeof av === "object" && av !== null) {
            count += countChanges(bv, av);
        } else {
            count++;
        }
    });
    return count;
}

const hasChanges = (a, b) => countChanges(a, b) > 0;

/** Recursively collects every object/array path that contains a change. */
function collectChangedPaths(obj, other, path, acc) {
    if (!obj || typeof obj !== "object") return;
    Object.keys(obj).forEach((key) => {
        const val = obj[key];
        const otherVal = other?.[key];
        const nodePath = `${path}.${key}`;
        if (Array.isArray(val)) {
            if (hasChanges(arrToObj(val), arrToObj(otherVal || []))) {
                acc.add(nodePath);
                val.forEach((item, i) => {
                    if (typeof item === "object" && item !== null) {
                        const otherItem = Array.isArray(otherVal) ? otherVal[i] : undefined;
                        if (hasChanges(item, otherItem)) {
                            const itemPath = `${nodePath}[${i}]`;
                            acc.add(itemPath);
                            collectChangedPaths(item, otherItem, itemPath, acc);
                        }
                    }
                });
            }
        } else if (typeof val === "object" && val !== null) {
            if (hasChanges(val, otherVal)) {
                acc.add(nodePath);
                collectChangedPaths(val, otherVal, nodePath, acc);
            }
        }
    });
}

const arrToObj = (arr) => arr.reduce((o, v, i) => ((o[i] = v), o), {});

const titleCase = (k) =>
    k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function renderPrimitive(value) {
    if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
    if (typeof value === "boolean")
        return <span className={value ? "text-green-600" : "text-red-600"}>{String(value)}</span>;
    return <span>{String(value)}</span>;
}

// ─── Chevron icon (no icon library dependency) ────────────────────────────────

function Chevron({ open }) {
    return (
        <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
        >
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function SunIcon() {
    return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="4" />
            <path
                strokeLinecap="round"
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
            />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
            />
        </svg>
    );
}

// ─── Diff row renderer (recursive) ─────────────────────────────────────────────

function DiffRows({ obj, counterpart, depth, side, path, expanded, toggle }) {
    if (!obj || typeof obj !== "object") return null;
    const changedKeys = useMemo(() => getChangedKeys(obj, counterpart), [obj, counterpart]);

    return (
        <>
            {Object.keys(obj).map((key) => {
                const val = obj[key];
                const otherVal = counterpart?.[key];
                const isChanged = changedKeys.has(key);
                const nodePath = `${path}.${key}`;
                const pl = depth * 16 + 14;

                const rowBase = `flex items-start gap-0 py-0.5 text-[12.5px] font-mono min-h-[22px] border-l-2 ${isChanged ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400" : "border-transparent"
                    }`;

                // Array
                if (Array.isArray(val)) {
                    const open = expanded.has(nodePath);
                    const changeCount = countChanges(arrToObj(val), arrToObj(otherVal || []));
                    return (
                        <div key={key}>
                            <div
                                className={`${rowBase} cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50`}
                                style={{ paddingLeft: pl }}
                                onClick={() => toggle(nodePath)}
                            >
                                <Chevron open={open} />
                                <span className="text-gray-500 dark:text-gray-400 mr-1.5 ml-1">{key}:</span>
                                <span className="text-gray-400">[{val.length}]</span>
                                {changeCount > 0 && (
                                    <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded-full">
                                        {changeCount} changed
                                    </span>
                                )}
                            </div>
                            {open &&
                                val.map((item, i) => {
                                    const otherItem = Array.isArray(otherVal) ? otherVal[i] : undefined;
                                    const itemPath = `${nodePath}[${i}]`;
                                    if (typeof item === "object" && item !== null) {
                                        const itemOpen = expanded.has(itemPath);
                                        const itemChanged = hasChanges(item, otherItem);
                                        return (
                                            <div
                                                key={i}
                                                className={`mx-3.5 my-1 rounded-md border overflow-hidden ${itemChanged ? "border-amber-400" : "border-gray-200 dark:border-gray-700"
                                                    }`}
                                                style={{ marginLeft: pl + 10 }}
                                            >
                                                <div
                                                    className="flex items-center gap-1 text-[11px] text-gray-400 px-2.5 py-1 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                                    onClick={() => toggle(itemPath)}
                                                >
                                                    <Chevron open={itemOpen} />
                                                    <span>[{i}]</span>
                                                    {itemChanged && (
                                                        <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded-full">
                                                            changed
                                                        </span>
                                                    )}
                                                </div>
                                                {itemOpen && (
                                                    <DiffRows
                                                        obj={item}
                                                        counterpart={otherItem}
                                                        depth={0}
                                                        side={side}
                                                        path={itemPath}
                                                        expanded={expanded}
                                                        toggle={toggle}
                                                    />
                                                )}
                                            </div>
                                        );
                                    }
                                    const rc = !deepEqual(item, otherItem);
                                    return (
                                        <div
                                            key={i}
                                            className={`flex items-start py-0.5 text-[12.5px] font-mono min-h-[22px] border-l-2 ${rc ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400" : "border-transparent"
                                                }`}
                                            style={{ paddingLeft: pl + 16 }}
                                        >
                                            <span className="text-gray-500 dark:text-gray-400 mr-1.5">[{i}]</span>
                                            {renderPrimitive(item)}
                                        </div>
                                    );
                                })}
                        </div>
                    );
                }

                // Nested object
                if (typeof val === "object" && val !== null) {
                    const open = expanded.has(nodePath);
                    const changeCount = countChanges(val, otherVal);
                    return (
                        <div key={key}>
                            <div
                                className={`${rowBase} cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50`}
                                style={{ paddingLeft: pl }}
                                onClick={() => toggle(nodePath)}
                            >
                                <Chevron open={open} />
                                <span className="text-gray-500 dark:text-gray-400 mr-1.5 ml-1">{key}:</span>
                                <span className="text-gray-400">{"{}"}</span>
                                {changeCount > 0 && (
                                    <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded-full">
                                        {changeCount} changed
                                    </span>
                                )}
                            </div>
                            {open && (
                                <DiffRows
                                    obj={val}
                                    counterpart={otherVal}
                                    depth={depth + 1}
                                    side={side}
                                    path={nodePath}
                                    expanded={expanded}
                                    toggle={toggle}
                                />
                            )}
                        </div>
                    );
                }

                // Primitive
                return (
                    <div key={key} className={rowBase} style={{ paddingLeft: pl }}>
                        <span className="text-gray-500 dark:text-gray-400 mr-1.5">{key}:</span>
                        {isChanged ? (
                            <span
                                className={`font-medium px-1.5 py-0.5 rounded ${side === "a"
                                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                    : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                                    }`}
                            >
                                {renderPrimitive(val)}
                            </span>
                        ) : (
                            renderPrimitive(val)
                        )}
                    </div>
                );
            })}
        </>
    );
}

// ─── Card / formatted view (recursive) ─────────────────────────────────────────

function CardView({ obj, counterpart, depth, path, expanded, toggle }) {
    const changedKeys = useMemo(() => getChangedKeys(obj, counterpart), [obj, counterpart]);
    if (!obj || typeof obj !== "object") return null;
    return (
        <>
            {Object.keys(obj).map((key) => {
                const val = obj[key];
                const otherVal = counterpart?.[key];
                const isChanged = changedKeys.has(key);
                const nodePath = `${path}.${key}`;

                if (Array.isArray(val)) {
                    const open = expanded.has(nodePath);
                    const changeCount = countChanges(arrToObj(val), arrToObj(otherVal || []));
                    return (
                        <div key={key} className={depth ? "mt-2" : "mt-2.5"}>
                            <div
                                className="flex items-center gap-1 cursor-pointer group"
                                onClick={() => toggle(nodePath)}
                            >
                                <Chevron open={open} />
                                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide group-hover:text-gray-900 dark:group-hover:text-gray-100">
                                    {titleCase(key)} ({val.length})
                                </span>
                                {changeCount > 0 && (
                                    <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded-full">
                                        {changeCount}
                                    </span>
                                )}
                            </div>
                            {open &&
                                val.map((item, i) => {
                                    const otherItem = Array.isArray(otherVal) ? otherVal[i] : undefined;
                                    if (typeof item === "object" && item !== null) {
                                        const itemPath = `${nodePath}[${i}]`;
                                        const itemOpen = expanded.has(itemPath);
                                        const itemChanged = hasChanges(item, otherItem);
                                        return (
                                            <div
                                                key={i}
                                                className={`my-1.5 rounded-md border p-2.5 bg-gray-50 dark:bg-gray-800/40 ${itemChanged ? "border-amber-400" : "border-gray-200 dark:border-gray-700"
                                                    }`}
                                            >
                                                <div
                                                    className="flex items-center gap-1 cursor-pointer"
                                                    onClick={() => toggle(itemPath)}
                                                >
                                                    <Chevron open={itemOpen} />
                                                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                                        Item {i}
                                                    </span>
                                                    {itemChanged && (
                                                        <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded-full">
                                                            changed
                                                        </span>
                                                    )}
                                                </div>
                                                {itemOpen && (
                                                    <CardView
                                                        obj={item}
                                                        counterpart={otherItem}
                                                        depth={depth + 1}
                                                        path={itemPath}
                                                        expanded={expanded}
                                                        toggle={toggle}
                                                    />
                                                )}
                                            </div>
                                        );
                                    }
                                    const rc = !deepEqual(item, otherItem);
                                    return (
                                        <div
                                            key={i}
                                            className={`flex justify-between gap-3 py-1.5 text-[13px] border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${rc ? "bg-amber-50 dark:bg-amber-950/30 -mx-2.5 px-2.5 rounded" : ""
                                                }`}
                                        >
                                            <span className="text-gray-500 dark:text-gray-400 text-xs">[{i}]</span>
                                            <span className="font-medium text-right break-words max-w-[60%]">
                                                {renderPrimitive(item)}
                                            </span>
                                        </div>
                                    );
                                })}
                        </div>
                    );
                }

                if (typeof val === "object" && val !== null) {
                    const open = expanded.has(nodePath);
                    const changeCount = countChanges(val, otherVal);
                    return (
                        <div key={key} className={depth ? "mt-2" : "mt-2.5"}>
                            <div
                                className="flex items-center gap-1 cursor-pointer group"
                                onClick={() => toggle(nodePath)}
                            >
                                <Chevron open={open} />
                                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide group-hover:text-gray-900 dark:group-hover:text-gray-100">
                                    {titleCase(key)}
                                </span>
                                {changeCount > 0 && (
                                    <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded-full">
                                        {changeCount}
                                    </span>
                                )}
                            </div>
                            {open && (
                                <div
                                    className={`mt-1.5 rounded-md border p-2.5 bg-gray-50 dark:bg-gray-800/40 ${changeCount > 0 ? "border-amber-400" : "border-gray-200 dark:border-gray-700"
                                        }`}
                                >
                                    <CardView
                                        obj={val}
                                        counterpart={otherVal}
                                        depth={depth + 1}
                                        path={nodePath}
                                        expanded={expanded}
                                        toggle={toggle}
                                    />
                                </div>
                            )}
                        </div>
                    );
                }

                return (
                    <div
                        key={key}
                        className={`flex justify-between gap-3 py-1.5 text-[13px] border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${isChanged ? "bg-amber-50 dark:bg-amber-950/30 -mx-2.5 px-2.5 rounded" : ""
                            }`}
                    >
                        <span className="text-gray-500 dark:text-gray-400 text-xs">{titleCase(key)}</span>
                        <span className="font-medium text-right break-words max-w-[60%]">
                            {renderPrimitive(val)}
                        </span>
                    </div>
                );
            })}
        </>
    );
}

// ─── Sample data ────────────────────────────────────────────────────────────────

const SAMPLE_A = {
    id: 158,
    name: "Plan logs test",
    product_count: 2,
    status: "draft",
    price: 12,
    cycle: "month",
    visibility: "public",
    product: {
        code: "LGA10",
        default_price: 14.99,
        description: "Legacy plan A",
        category: null,
        created_at: "2026-04-29T06:03:00Z",
    },
    regions: [
        { id: 1, name: "US", active: true },
        { id: 2, name: "EU", active: false },
    ],
};

const SAMPLE_B = {
    id: 158,
    name: "Plan logs test",
    product_count: 3,
    status: "active",
    price: 15,
    cycle: "month",
    visibility: "private",
    product: {
        code: "LGA10",
        default_price: 14.99,
        description: "Legacy plan A - updated",
        category: "premium",
        created_at: "2026-04-29T06:03:00Z",
    },
    regions: [
        { id: 1, name: "US", active: true },
        { id: 2, name: "EU", active: true },
    ],
};

// ─── Main component ────────────────────────────────────────────────────────────

export default function JsonCompare() {
    const { isDark, toggle: toggleTheme } = useDarkMode();
    const [rawA, setRawA] = useState("");
    const [rawB, setRawB] = useState("");
    const [errA, setErrA] = useState("");
    const [errB, setErrB] = useState("");
    const [dataA, setDataA] = useState(null);
    const [dataB, setDataB] = useState(null);
    const [mode, setMode] = useState("diff"); // "diff" | "card"
    const [expanded, setExpanded] = useState(new Set());
    const [shareUrl, setShareUrl] = useState("");
    const [shareError, setShareError] = useState("");
    const [loadingShare, setLoadingShare] = useState(false);

    const toggle = useCallback((path) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(path) ? next.delete(path) : next.add(path);
            return next;
        });
    }, []);

    const totalChanges = useMemo(() => {
        if (!dataA || !dataB) return 0;
        return countChanges(dataA, dataB);
    }, [dataA, dataB]);

    const runCompare = useCallback(() => {
        setErrA("");
        setErrB("");
        setShareUrl("");
        setShareError("");

        if (!rawA.trim() || !rawB.trim()) {
            if (!rawA.trim()) setErrA("Paste a JSON object to compare");
            if (!rawB.trim()) setErrB("Paste a JSON object to compare");
            return;
        }

        let parsedA, parsedB;
        try {
            parsedA = JSON.parse(rawA);
        } catch (e) {
            setErrA(`Invalid JSON: ${e.message}`);
            return;
        }
        try {
            parsedB = JSON.parse(rawB);
        } catch (e) {
            setErrB(`Invalid JSON: ${e.message}`);
            return;
        }

        setDataA(parsedA);
        setDataB(parsedB);

        const autoExpand = new Set();
        collectChangedPaths(parsedA, parsedB, "root", autoExpand);
        setExpanded(autoExpand);
    }, [rawA, rawB]);

    const loadSample = useCallback(() => {
        setRawA(JSON.stringify(SAMPLE_A, null, 2));
        setRawB(JSON.stringify(SAMPLE_B, null, 2));
        setErrA("");
        setErrB("");
        setTimeout(() => {
            setDataA(SAMPLE_A);
            setDataB(SAMPLE_B);
            const autoExpand = new Set();
            collectChangedPaths(SAMPLE_A, SAMPLE_B, "root", autoExpand);
            setExpanded(autoExpand);
        }, 0);
    }, []);

    const swap = useCallback(() => {
        setRawA(rawB);
        setRawB(rawA);
        if (dataA || dataB) {
            const newA = dataB;
            const newB = dataA;
            setDataA(newA);
            setDataB(newB);
        }
    }, [rawA, rawB, dataA, dataB]);

    const clearAll = useCallback(() => {
        setRawA("");
        setRawB("");
        setErrA("");
        setErrB("");
        setDataA(null);
        setDataB(null);
        setShareUrl("");
        setShareError("");
        setExpanded(new Set());
    }, []);

    // Collect every expandable path currently in the data, for expand/collapse all
    const allPaths = useMemo(() => {
        if (!dataA && !dataB) return [];
        const paths = new Set();
        const walk = (obj, other, path) => {
            if (!obj || typeof obj !== "object") return;
            Object.keys(obj).forEach((k) => {
                const val = obj[k];
                const otherVal = other?.[k];
                const p = `${path}.${k}`;
                if (Array.isArray(val)) {
                    paths.add(p);
                    val.forEach((item, i) => {
                        if (typeof item === "object" && item !== null) {
                            const ip = `${p}[${i}]`;
                            paths.add(ip);
                            walk(item, Array.isArray(otherVal) ? otherVal[i] : undefined, ip);
                        }
                    });
                } else if (typeof val === "object" && val !== null) {
                    paths.add(p);
                    walk(val, otherVal, p);
                }
            });
        };
        walk(dataA || {}, dataB || {}, "root");
        walk(dataB || {}, dataA || {}, "root");
        return [...paths];
    }, [dataA, dataB]);

    const expandAll = useCallback(() => setExpanded(new Set(allPaths)), [allPaths]);
    const collapseAll = useCallback(() => setExpanded(new Set()), []);

    const hasOutput = dataA !== null && dataB !== null;

    useEffect(() => {
        const url = new URL(window.location.href);
        const id = url.searchParams.get("shareId");
        if (!id) return;

        const fetchShared = async () => {
            setLoadingShare(true);
            setShareError("");
            try {
                const res = await fetch(`http://127.0.0.1:8000/json/${id}`);
                if (!res.ok) {
                    throw new Error(`Could not load shared comparison (${res.status})`);
                }
                const data = await res.json();
                setRawA(JSON.stringify(data.json1, null, 2));
                setRawB(JSON.stringify(data.json2, null, 2));
                setDataA(data.json1);
                setDataB(data.json2);
                const autoExpand = new Set();
                collectChangedPaths(data.json1, data.json2, "root", autoExpand);
                setExpanded(autoExpand);
                setShareUrl(window.location.href);
            } catch (err) {
                setShareError(err.message || "Failed to load shared comparison.");
            } finally {
                setLoadingShare(false);
            }
        };

        fetchShared();
    }, []);

    const handleShare = useCallback(async () => {
        if (!dataA || !dataB) return;
        setLoadingShare(true);
        setShareError("");
        try {
            const res = await fetch("http://127.0.0.1:8000/json", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ json1: dataA, json2: dataB, comparison_result: null }),
            });
            if (!res.ok) {
                throw new Error(`Failed to share comparison (${res.status})`);
            }
            const data = await res.json();
            const shareId = data.id;
            const shareLink = `${window.location.origin}${window.location.pathname}?shareId=${shareId}`;
            setShareUrl(shareLink);
            window.history.replaceState(null, "", shareLink);
        } catch (err) {
            setShareError(err.message || "Unable to create share link.");
        } finally {
            setLoadingShare(false);
        }
    }, [dataA, dataB]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
            <div className="font-sans text-gray-900 dark:text-gray-100 max-w-5xl mx-auto p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">JSON Compare</h1>
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                            <button
                                onClick={() => setMode("diff")}
                                className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${mode === "diff"
                                    ? "bg-white dark:bg-gray-700 shadow-sm font-medium"
                                    : "text-gray-500 dark:text-gray-400"
                                    }`}
                            >
                                Diff view
                            </button>
                            <button
                                onClick={() => setMode("card")}
                                className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${mode === "card"
                                    ? "bg-white dark:bg-gray-700 shadow-sm font-medium"
                                    : "text-gray-500 dark:text-gray-400"
                                    }`}
                            >
                                Formatted view
                            </button>
                        </div>
                        <button
                            onClick={toggleTheme}
                            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {isDark ? <SunIcon /> : <MoonIcon />}
                        </button>
                    </div>
                </div>

                {/* Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className="text-sm font-medium mb-1.5 block">JSON A</label>
                        <textarea
                            value={rawA}
                            onChange={(e) => setRawA(e.target.value)}
                            placeholder="Paste first JSON object here"
                            className="w-full h-32 text-xs font-mono p-2.5 rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        {errA && <p className="text-xs text-red-600 mt-1">{errA}</p>}
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1.5 block">JSON B</label>
                        <textarea
                            value={rawB}
                            onChange={(e) => setRawB(e.target.value)}
                            placeholder="Paste second JSON object here"
                            className="w-full h-32 text-xs font-mono p-2.5 rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        {errB && <p className="text-xs text-red-600 mt-1">{errB}</p>}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={loadSample}
                        className="px-3.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        Load sample
                    </button>
                    <button
                        onClick={runCompare}
                        className="px-3.5 py-1.5 text-sm rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium hover:bg-blue-100 dark:hover:bg-blue-900"
                    >
                        Compare →
                    </button>
                    <button
                        onClick={swap}
                        className="px-3.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        Swap
                    </button>
                    {hasOutput && (
                        <button
                            onClick={clearAll}
                            className="px-3.5 py-1.5 text-sm rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            Clear
                        </button>
                    )}
                    {hasOutput && (
                        <button
                            onClick={handleShare}
                            disabled={loadingShare}
                            className="px-3.5 py-1.5 text-sm rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium hover:bg-blue-100 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loadingShare ? "Sharing..." : "Share"}
                        </button>
                    )}
                </div>

                {shareError && (
                    <div className="mb-3 text-sm text-red-600 dark:text-red-300">{shareError}</div>
                )}
                {shareUrl && (
                    <div className="mb-3 text-sm text-gray-700 dark:text-gray-300 break-words">
                        Share link: <a href={shareUrl} className="text-blue-600 dark:text-blue-300 underline" target="_blank" rel="noreferrer">{shareUrl}</a>
                    </div>
                )}

                {/* Summary bar */}
                {hasOutput && (
                    <div className="flex items-center gap-2.5 mb-3 text-sm flex-wrap">
                        <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-full ${totalChanges > 0
                                ? "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200"
                                : "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                                }`}
                        >
                            {totalChanges > 0 ? `${totalChanges} key${totalChanges !== 1 ? "s" : ""} changed` : "Identical"}
                        </span>
                        <div className="flex gap-1.5 ml-auto">
                            <button
                                onClick={expandAll}
                                className="text-xs px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                Expand all
                            </button>
                            <button
                                onClick={collapseAll}
                                className="text-xs px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                Collapse all
                            </button>
                        </div>
                    </div>
                )}

                {/* Output */}
                {hasOutput && mode === "diff" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="px-3.5 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                A
                            </div>
                            <div className="bg-white dark:bg-gray-900 overflow-x-auto">
                                <DiffRows
                                    obj={dataA}
                                    counterpart={dataB}
                                    depth={0}
                                    side="a"
                                    path="root"
                                    expanded={expanded}
                                    toggle={toggle}
                                />
                            </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="px-3.5 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                B
                            </div>
                            <div className="bg-white dark:bg-gray-900 overflow-x-auto">
                                <DiffRows
                                    obj={dataB}
                                    counterpart={dataA}
                                    depth={0}
                                    side="b"
                                    path="root"
                                    expanded={expanded}
                                    toggle={toggle}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {hasOutput && mode === "card" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="px-3.5 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                A — formatted
                            </div>
                            <div className="bg-white dark:bg-gray-900 p-3">
                                <CardView
                                    obj={dataA}
                                    counterpart={dataB}
                                    depth={0}
                                    path="root"
                                    expanded={expanded}
                                    toggle={toggle}
                                />
                            </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="px-3.5 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                                B — formatted
                            </div>
                            <div className="bg-white dark:bg-gray-900 p-3">
                                <CardView
                                    obj={dataB}
                                    counterpart={dataA}
                                    depth={0}
                                    path="root"
                                    expanded={expanded}
                                    toggle={toggle}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}