"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { SignedIn, SignedOut, useClerk } from "@clerk/nextjs";

import { Separator } from "@/app/components/ui/separator";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/app/components/ui/sheet";
import { Button } from "@/app/components/ui/button";
import {
	AlbumIcon,
	BookImageIcon,
	BoxesIcon,
	CalendarCheck2Icon,
	CalendarIcon,
	CreditCardIcon,
	HomeIcon,
	LogOutIcon,
	ShirtIcon,
	StickerIcon,
	StoreIcon,
	TagsIcon,
	UsersIcon,
} from "lucide-react";
import { ProfileType } from "@/app/api/users/definitions";
import GlitterLogo from "@/app/components/landing/glitter-logo";

type MobileSidebarItemProps = {
	href: string;
	children: React.ReactNode;
};

const MobileSidebarItem = ({ href, children }: MobileSidebarItemProps) => {
	return (
		<li>
			<SheetClose
				asChild
				className="hover:bg-accent hover:text-accent-foreground flex w-full rounded-md p-2 text-left"
			>
				<Link href={href}>{children}</Link>
			</SheetClose>
		</li>
	);
};

type MobileSidebarProps = {
	profile?: ProfileType | null;
	children: React.ReactNode;
};

const MobileSidebar = ({ children, profile }: MobileSidebarProps) => {
	const { signOut } = useClerk();
	const router = useRouter();
	const pathname = usePathname();

	if (pathname.includes("festivals") && pathname.includes("registration"))
		return null;

	return (
		<Sheet>
			<SheetTrigger
				className="cursor-default hover:bg-primary-100/30 hover:text-primary-500"
				variant="outline"
				size="icon"
			>
				{children}
			</SheetTrigger>
			<SheetContent side="left">
				<SheetHeader>
					<SheetTitle>
						<SheetClose>
							<Link href="/">
								<GlitterLogo variant="dark" height={48} width={48} />
							</Link>
						</SheetClose>
					</SheetTitle>
				</SheetHeader>
				<Separator className="my-2" />
				<ul className="flex flex-col">
					<MobileSidebarItem href="/">
						<HomeIcon className="mr-2 h-6 w-6" />
						Inicio
					</MobileSidebarItem>
					<MobileSidebarItem href="/next_event">
						<CalendarCheck2Icon className="mr-2 h-6 w-6" />
						Próximo Evento
					</MobileSidebarItem>
					{profile && (
						<MobileSidebarItem href="/store">
							<StoreIcon className="mr-2 h-6 w-6" />
							Tiendita
						</MobileSidebarItem>
					)}
					<MobileSidebarItem href="/festivals">
						<BookImageIcon className="mr-2 h-6 w-6" />
						Festivales
					</MobileSidebarItem>
					<div className="ml-4">
						<MobileSidebarItem href="/festivals/festicker">
							<StickerIcon className="mr-2 h-6 w-6" />
							Festicker
						</MobileSidebarItem>
					</div>
					<MobileSidebarItem href="/festivals/categories">
						<BoxesIcon className="w-6 h-6 mr-2" />
						Categorías Glitter
					</MobileSidebarItem>
					{profile && profile.role === "admin" && (
						<>
							<MobileSidebarItem href="/dashboard">
								<h4 className="text-lg">Dashboard</h4>
							</MobileSidebarItem>
							<div className="ml-4">
								<MobileSidebarItem href="/dashboard/users?limit=10&offset=0&includeAdmins=false&status=pending&sort=updatedAt&direction=desc&profileCompletion=complete">
									<UsersIcon className="mr-2 h-6 w-6" />
									Usuarios
								</MobileSidebarItem>
								<MobileSidebarItem href="/dashboard/reservations">
									<AlbumIcon className="mr-2 h-6 w-6" />
									Reservas
								</MobileSidebarItem>
								<MobileSidebarItem href="/dashboard/payments">
									<CreditCardIcon className="mr-2 h-6 w-6" />
									Pagos
								</MobileSidebarItem>
								<MobileSidebarItem href="/dashboard/orders">
									<ShirtIcon className="mr-2 h-6 w-6" />
									Pedidos
								</MobileSidebarItem>
								<MobileSidebarItem href="/dashboard/festivals">
									<CalendarIcon className="mr-2 h-6 w-6" />
									Festivales
								</MobileSidebarItem>
								<MobileSidebarItem href="/dashboard/subcategories">
									<BoxesIcon className="mr-2 h-6 w-6" />
									Subcategorías
								</MobileSidebarItem>
								<MobileSidebarItem href="/dashboard/tags">
									<TagsIcon className="mr-2 h-6 w-6" />
									Etiquetas
								</MobileSidebarItem>
							</div>
						</>
					)}
					<SignedIn>
						<Separator className="my-2" />
						<SheetClose asChild>
							<Button
								className="p-2"
								onClick={() => signOut(() => router.push("/"))}
								variant="ghost"
							>
								<LogOutIcon className="mr-2 h-6 w-6" />
								<span className="w-full text-left text-base font-normal">
									Cerrar Sesión
								</span>
							</Button>
						</SheetClose>
					</SignedIn>
				</ul>
			</SheetContent>
		</Sheet>
	);
};

export default MobileSidebar;
