import AuthFormSkeleton from "@/app/components/auth/auth-form-skeleton";

export default function Loading() {
  return (
    <div className="flex justify-center my-4 w-full">
      <AuthFormSkeleton variant="signUp" />
    </div>
  );
}
