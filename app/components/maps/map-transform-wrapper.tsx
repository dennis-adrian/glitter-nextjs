"use client";

import { forwardRef, useCallback, useState } from "react";
import { TransformWrapper } from "react-zoom-pan-pinch";
import type {
	ReactZoomPanPinchProps,
	ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";

type MapTransformWrapperProps = ReactZoomPanPinchProps & {
	panningDisabled?: boolean;
};

const MapTransformWrapper = forwardRef<
	ReactZoomPanPinchRef,
	MapTransformWrapperProps
>(function MapTransformWrapper(
	{
		panningDisabled = false,
		minScale = 1,
		initialScale = 1,
		panning,
		wheel,
		onTransformed,
		...rest
	},
	ref,
) {
	const [isAtMinScale, setIsAtMinScale] = useState(
		() => initialScale <= minScale,
	);

	const handleTransformed = useCallback(
		(
			_ref: ReactZoomPanPinchRef,
			state: { scale: number; positionX: number; positionY: number },
		) => {
			setIsAtMinScale(state.scale <= minScale);
			onTransformed?.(_ref, state);
		},
		[minScale, onTransformed],
	);

	return (
		<TransformWrapper
			ref={ref}
			initialScale={initialScale}
			minScale={minScale}
			{...rest}
			wheel={{
				step: 0.1,
				activationKeys: ["Control"],
				...wheel,
			}}
			panning={{
				velocityDisabled: true,
				disabled: isAtMinScale || panningDisabled,
				...panning,
			}}
			onTransformed={handleTransformed}
		/>
	);
});

export default MapTransformWrapper;
