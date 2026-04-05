export function fitCouponText(root: ParentNode) {
	const nodes = root.querySelectorAll<HTMLElement>("[data-fit-text='true']");

	nodes.forEach((el) => {
		const min = Number(el.dataset.fitMinPx ?? 8);
		const max = Number(el.dataset.fitMaxPx ?? 18);
		const step = Number(el.dataset.fitStepPx ?? 0.5);
		const singleLine = el.dataset.fitSingleLine === "true";

		if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
			return;
		}

		const effectiveStep = Number.isFinite(step) && step > 0 ? step : 0.5;

		el.style.fontSize = `${max}px`;
		el.style.whiteSpace = singleLine ? "nowrap" : "normal";

		let size = max;
		while (size > min) {
			const overWidth = el.scrollWidth - 0.5 > el.clientWidth;
			const overHeight = el.scrollHeight - 0.5 > el.clientHeight;
			if (!overWidth && !overHeight) break;
			size -= effectiveStep;
			el.style.fontSize = `${size}px`;
		}

		if (size < min) {
			el.style.fontSize = `${min}px`;
		}
	});
}
