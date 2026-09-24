import Image from "next/image";
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/app/components/ui/button";

export type EditableBundle = {
  orderBundleId: number;
  name: string;
  imageUrl: string;
  unitPrice: number;
  /** Complete bundles in the order; null when components were adjusted. */
  originalQuantity: number | null;
  quantity: number;
  paidTotal: number;
  /** Units in one bundle, or what is left of an adjusted bundle. */
  contents: string;
  isRemoved: boolean;
};

export function bundleTotal(bundle: EditableBundle) {
  if (bundle.isRemoved) return 0;
  return bundle.originalQuantity == null
    ? bundle.paidTotal
    : bundle.unitPrice * bundle.quantity;
}

export default function EditOrderBundleRow({
  bundle,
  onQuantityChange,
  onRemove,
  onUndoRemove,
}: {
  bundle: EditableBundle;
  onQuantityChange: (id: number, value: number) => void;
  onRemove: (id: number) => void;
  onUndoRemove: (id: number) => void;
}) {
  const locked = bundle.originalQuantity == null;
  return (
    <div
      className={`flex gap-4 py-4 border-b last:border-b-0 transition-opacity ${
        bundle.isRemoved ? "opacity-50" : ""
      }`}
    >
      <div className="h-20 w-20 rounded-md overflow-hidden bg-gray-100 shrink-0">
        <Image
          src={bundle.imageUrl}
          alt=""
          width={80}
          height={80}
          className="object-cover w-full h-full"
        />
      </div>
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex justify-between items-start gap-2">
          <p
            className={`font-medium text-sm ${
              bundle.isRemoved ? "line-through text-muted-foreground" : ""
            }`}
          >
            Combo {bundle.name}
          </p>
          <p className="font-medium text-sm shrink-0">
            Bs{bundleTotal(bundle).toFixed(2)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {locked ? "Contenido actual" : "Cada combo incluye"}:{" "}
          {bundle.contents}
        </p>
        {locked ? (
          <p className="text-xs text-muted-foreground">
            Este combo fue ajustado por la tienda. Escribinos si necesitás
            cambiarlo.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Bs{bundle.unitPrice.toFixed(2)} por combo · podés reducirlo o
            quitarlo completo
          </p>
        )}
        {!locked && (
          <div className="flex items-center gap-2 mt-1">
            {bundle.isRemoved ? (
              <button
                type="button"
                onClick={() => onUndoRemove(bundle.orderBundleId)}
                className="text-xs text-purple-600 hover:underline"
              >
                Deshacer
              </button>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Quitar un combo ${bundle.name}`}
                    onClick={() =>
                      onQuantityChange(
                        bundle.orderBundleId,
                        bundle.quantity - 1,
                      )
                    }
                    disabled={bundle.quantity <= 1}
                  >
                    <MinusIcon className="h-3 w-3" />
                  </Button>
                  <span className="w-10 text-center text-base">
                    {bundle.quantity}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Sumar un combo ${bundle.name}`}
                    onClick={() =>
                      onQuantityChange(
                        bundle.orderBundleId,
                        bundle.quantity + 1,
                      )
                    }
                    disabled={bundle.quantity >= (bundle.originalQuantity ?? 0)}
                  >
                    <PlusIcon className="h-3 w-3" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => onRemove(bundle.orderBundleId)}
                  aria-label={`Eliminar combo ${bundle.name}`}
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
