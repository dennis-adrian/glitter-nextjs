'use client';

import { Pen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { Button } from "@/app/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/app/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { NewFestivalForm } from "@/app/components/festivals/forms/new-festival";
import { EditFestivalForm } from "@/app/components/festivals/forms/edit-festival";
import { deleteFestival } from "@/app/data/festivals/actions";
import { toast } from "sonner";

export default function FestivalsTable({ festivals }: { festivals: FestivalWithDates[] }) {
    const router = useRouter();
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage] = useState(10);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedFestival, setSelectedFestival] = useState<FestivalWithDates | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const indexOfLastRow = currentPage * rowsPerPage;
    const indexOfFirstRow = indexOfLastRow - rowsPerPage;
    const currentRows = festivals.slice(indexOfFirstRow, indexOfLastRow);
    const totalPages = Math.ceil(festivals.length / rowsPerPage);

    const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

    const formatDates = (dates: FestivalWithDates['festivalDates']) => {
        if (!dates || dates.length === 0) return "No definido";
        return dates.map(date => {
            const start = new Date(date.startDate).toLocaleDateString();
            const end = new Date(date.endDate).toLocaleDateString();
            return `${start} - ${end}`;
        }).join(", ");
    };

    const handleRowClick = (festivalId: number) => {
        router.push(`/dashboard/festivals/${festivalId}`);
    };

    const handleActionClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    const handleEditClick = (festival: FestivalWithDates, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedFestival(festival);
        setIsEditDialogOpen(true);
    };

    const handleDeleteClick = (festival: FestivalWithDates, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedFestival(festival);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!selectedFestival) return;
      
        setIsDeleting(true);
        const toastId = toast.loading("Eliminando festival...");
      
        try {
          const result = await deleteFestival(selectedFestival.id);
          
          if (result.success) {
            toast.success("Festival eliminado correctamente", { id: toastId });
            setIsDeleteDialogOpen(false);
            router.refresh();
          } else {
            toast.error(result.error || "Error al eliminar el festival", { id: toastId });
          }
        } catch (error) {
          console.error("Error deleting festival:", error);
          toast.error("Ocurrió un error al eliminar el festival", { id: toastId });
        } finally {
          setIsDeleting(false);
        }
      };

    return (
        <div className="container p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold md:text-3xl">Festivales</h1>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Agregar festival
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]" aria-describedby={undefined}>
                        <DialogHeader>
                            <DialogTitle>Crear nuevo festival</DialogTitle>
                        </DialogHeader>
                        <NewFestivalForm
                            onSuccess={() => {
                                setIsDialogOpen(false);
                                router.refresh();
                            }} />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                ID
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Nombre
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Estado
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Fechas
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Descripción
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                Acciones
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {currentRows.map((festival) => (
                            <tr
                                key={festival.id}
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => handleRowClick(festival.id)}
                            >
                                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                                    {festival.id}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                    {festival.name}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${festival.status === 'active' ? 'bg-green-100 text-green-800' :
                                        festival.status === 'published' ? 'bg-blue-100 text-blue-800' :
                                            festival.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'
                                        }`}>
                                        {festival.status}
                                    </span>
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                    {formatDates(festival.festivalDates)}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    {festival.description || "No definido"}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium" onClick={handleActionClick}>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                                            title="Editar"
                                            onClick={(e) => handleEditClick(festival, e)}
                                        >
                                            <Pen className="h-5 w-5" />
                                        </button>
                                        <button
                                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                                            title="Eliminar"
                                            onClick={(e) => handleDeleteClick(festival, e)}
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                    Mostrando {indexOfFirstRow + 1}-{Math.min(indexOfLastRow, festivals.length)} de {festivals.length} festivales
                </div>
                <div className="flex space-x-2">
                    <button
                        onClick={() => paginate(currentPage - 1)}
                        disabled={currentPage === 1}
                        className={`rounded px-3 py-1 ${currentPage === 1 ?
                            'cursor-not-allowed bg-gray-100 text-gray-400' :
                            'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                    >
                        Anterior
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((number) => (
                        <button
                            key={number}
                            onClick={() => paginate(number)}
                            className={`rounded px-3 py-1 ${currentPage === number ?
                                'bg-blue-600 text-white' :
                                'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                        >
                            {number}
                        </button>
                    ))}

                    <button
                        onClick={() => paginate(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className={`rounded px-3 py-1 ${currentPage === totalPages ?
                            'cursor-not-allowed bg-gray-100 text-gray-400' :
                            'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                    >
                        Siguiente
                    </button>
                </div>
            </div>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[425px]" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Editar festival</DialogTitle>
                    </DialogHeader>
                    {selectedFestival && (
                        <EditFestivalForm
                            festival={selectedFestival}
                            onSuccess={() => {
                                setIsEditDialogOpen(false);
                                router.refresh();
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Eliminarás permanentemente el festival &quot;{selectedFestival?.name}&quot;.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}