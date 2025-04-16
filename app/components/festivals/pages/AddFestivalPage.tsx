"use client";
import { Button } from "@/app/components/ui/button";
import NewFestivalForm from "@/app/components/festivals/forms/new-festival";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function AddFestivalPage() {
  return (
    <div className="container p-4 md:p-6">
      <div className="mb-6">
        <Link href="/dashboard/festivals">
          <Button variant="ghost">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Retornar a Festivales
          </Button>
        </Link>
      </div>
      
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Nuevo Festival</h1>
        <div className="bg-background p-6 rounded-lg border">
          <NewFestivalForm onSuccess={() => {}} /> {}
        </div>
      </div>
    </div>
  );
}