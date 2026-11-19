import Loader from "@/app/components/loader";

/** While a tap from elsewhere in the site opens `/links`. */
export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader />
    </div>
  );
}
