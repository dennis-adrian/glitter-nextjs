"use client";

import JsBarcode, { type Options } from "jsbarcode";
import { useCallback, useEffect, useRef, type CSSProperties } from "react";

export interface ReactBarcodeProps {
  /**
   * Value to be rendered as barcode
   */
  value: string;
  /**
   * JSBarcode options
   */
  options?: Options;
  className?: string;
}

export function ReactBarcode({
  className,
  value,
  options,
}: Readonly<ReactBarcodeProps>): React.JSX.Element {
  const containerRef = useRef<never>(null);

  const renderBarcode = useCallback(JsBarcode, [
    value,
    containerRef.current,
    options,
  ]);

  useEffect(() => {
    renderBarcode(containerRef.current, value, options);
  }, [renderBarcode, value, options]);

  return <svg ref={containerRef} className={className} />;
}

export default ReactBarcode;
