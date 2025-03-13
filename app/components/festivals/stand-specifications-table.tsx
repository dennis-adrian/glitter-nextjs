import { FestivalSectorBase } from "@/app/lib/festival_sectors/definitions";

// function TableRow({ sector }: { sector: FestivalSectorBase }) {
//   return (
//     <tr>
//       <td className="border p-3 font-medium">{sector.name}</td>
//       <td className="border p-3">5m x 5m, Proximidad a Entrada Principal</td>
//       <td className="border p-3">${sector.price}</td>
//       <td className="border p-3">
//         Electricidad, Wi-Fi, 4 Pases de Expositor, Señalización Premium
//       </td>
//     </tr>
//   );
// }

export default function StandSpecificationsTable({
  festivalSectors,
}: {
  festivalSectors: FestivalSectorBase[];
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-muted">
          <th className="border p-3 text-left">Sector</th>
          <th className="border p-3 text-left">Especificaciones del Espacio</th>
          <th className="border p-3 text-left">Precio por 2 Días</th>
          <th className="border p-3 text-left">Servicios Incluidos</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="border p-3 font-medium">Galería</td>
          <td className="border p-3">
            60cm x 120cm (media mesa). Proximidad a entrada principal. Puede
            compartir espacio con otro ilustrador
          </td>
          <td className="border p-3">Bs300</td>
          <td className="border p-3">
            Puntos de conexión a electricidad. Ambiente cerrado con aire
            acondicionado. Dos (2) credenciales, dos (2) sillas y una (1) mesa
            incluida
          </td>
        </tr>
        <tr className="bg-muted/50">
          <td className="border p-3 font-medium">Pasillo y Big Apple</td>
          <td className="border p-3">
            60cm x 120cm (media mesa). Área de alto tráfico. Puede compartir
            espacio con otro ilustrador
          </td>
          <td className="border p-3">Bs.280</td>
          <td className="border p-3">
            Ambiente abierto, techado. Dos (2) credenciales, dos (2) sillas y
            una (1) mesa incluida
          </td>
        </tr>
        <tr>
          <td className="border p-3 font-medium">Ballivián (ilustradores)</td>
          <td className="border p-3">
            60cm x 120cm (media mesa). Área final. Puede compartir espacio con
            otro ilustrador
          </td>
          <td className="border p-3">Bs210</td>
          <td className="border p-3">
            Ambiente semi-cerrado, techado. Dos (2) credenciales, dos (2) sillas
            y una (1) mesa incluida
          </td>
        </tr>
        <tr className="bg-muted/50">
          <td className="border p-3 font-medium">Ballivián (gastronomía)</td>
          <td className="border p-3">
            80cm x 100cm (mesa completa). Área final. No puede compartir
            espacio.
          </td>
          <td className="border p-3">Bs350</td>
          <td className="border p-3">
            Puntos de conexión a electricidad. Ambiente semi-cerrado, techado.
            Dos (2) credenciales, dos (2) sillas y una (1) mesa incluida
          </td>
        </tr>
      </tbody>
    </table>
  );
}
