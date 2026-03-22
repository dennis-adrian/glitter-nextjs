"use client";

import {
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useRef,
} from "react";

import { cn } from "@/lib/utils";

export type FitTextProps = {
	children: ReactNode;
	minFontSizePx: number;
	maxFontSizePx: number;
	/** Single line: shrink until text fits width. Multi: wrap and shrink until block fits height. */
	mode: "single-line" | "multi-line";
	/** Classes on the text node (weight, color, leading). */
	className?: string;
	/** Classes on the measurement wrapper. */
	wrapperClassName?: string;
};

function applyFontSize(el: HTMLElement, px: number) {
	el.style.fontSize = `${px}px`;
}

export function FitText({
	children,
	minFontSizePx,
	maxFontSizePx,
	mode,
	className,
	wrapperClassName,
}: FitTextProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLParagraphElement>(null);

	const fit = useCallback(() => {
		const container = containerRef.current;
		const text = textRef.current;
		if (!container || !text) return;

		const loBound = minFontSizePx;
		const hiBound = maxFontSizePx;
		if (loBound > hiBound) return;

		if (mode === "single-line" && container.clientWidth < 2) {
			applyFontSize(text, loBound);
			return;
		}
		if (mode === "multi-line" && container.clientHeight < 2) {
			applyFontSize(text, loBound);
			return;
		}

		if (mode === "single-line") {
			text.style.whiteSpace = "nowrap";
			text.style.wordBreak = "normal";
			let lo = loBound;
			let hi = hiBound;
			let best = loBound;
			while (lo <= hi) {
				const mid = (lo + hi) >> 1;
				applyFontSize(text, mid);
				if (text.scrollWidth <= container.clientWidth + 1) {
					best = mid;
					lo = mid + 1;
				} else {
					hi = mid - 1;
				}
			}
			applyFontSize(text, best);
			return;
		}

		text.style.whiteSpace = "normal";
		text.style.wordBreak = "break-word";
		let lo = loBound;
		let hi = hiBound;
		let best = loBound;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			applyFontSize(text, mid);
			if (text.scrollHeight <= container.clientHeight + 1) {
				best = mid;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		applyFontSize(text, best);
	}, [minFontSizePx, maxFontSizePx, mode]);

	useLayoutEffect(() => {
		fit();
	}, [fit, children]);

	useLayoutEffect(() => {
		const node = containerRef.current;
		if (!node) return;
		const ro = new ResizeObserver(() => fit());
		ro.observe(node);
		return () => ro.disconnect();
	}, [fit]);

	return (
		<div
			ref={containerRef}
			className={cn("min-w-0 overflow-hidden", wrapperClassName)}
		>
			<p ref={textRef} className={cn("m-0 w-full", className)}>
				{children}
			</p>
		</div>
	);
}
