import { FilePenLineIcon, FrownIcon } from "lucide-react";

import { ProfileType } from "@/app/api/users/definitions";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import ProfileCategoryBadge from "@/app/components/user_profile/category-badge";
import ProfilePicField from "@/app/components/user_profile/profile_pic/field";
import VerificationStatusBadge from "@/app/components/user_profile/verification-status-badge";
import { Button } from "@/components/ui/button";
import Modal from "@/components/user_profile/modal";
import Form from "./form";
import TagBadge from "@/app/components/tags/tag-badge";
import { Badge } from "@/app/components/ui/badge";
import SocialMediaBadge from "@/app/components/social-media-badge";

export default function PublicProfile({
  profile,
  title = "Perfil Público",
}: {
  profile: ProfileType;
  title?: string;
}) {
  const socials = profile.userSocials.filter((social) => social.username);
  // The first subcategory is the main category that's why we slice it
  const subcategories = profile.profileSubcategories
    .map((ps) => ps.subcategory)
    .slice(1);

  return (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="flex justify-between items-center">
						<span className="text-lg md:text-2xl font-bold">{title}</span>
						<div className="flex gap-2">
							<div>
								<Modal
									profile={profile}
									title="Editar Perfil"
									FormComponent={Form}
								>
									<Button
										variant="outline"
										disabled={profile.status === "banned"}
									>
										<FilePenLineIcon className="mr-1 h-4 w-4" />
										Editar
									</Button>
								</Modal>
							</div>
						</div>
					</CardTitle>
					<CardDescription>
						Esta información será visible para todos los usuarios de la página.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col items-center gap-4">
						<ProfilePicField profile={profile} />
						<div className="flex flex-wrap justify-center gap-2">
							{profile.status !== "banned" && (
								<VerificationStatusBadge profile={profile} />
							)}
							{profile.category !== "none" && (
								<ProfileCategoryBadge profile={profile} />
							)}
							{subcategories.length > 0 && (
								<div className="flex flex-wrap gap-2">
									{subcategories.map((subcategory) => (
										<Badge key={subcategory.id} variant="outline">
											{subcategory.label}
										</Badge>
									))}
								</div>
							)}
						</div>
						{profile.profileTags.length > 0 && (
							<div>
								{profile.profileTags.map((profileTag) => (
									<TagBadge key={profileTag.id} tag={profileTag.tag} />
								))}
							</div>
						)}
						<div className="relative min-w-full">
							<div className="flex flex-col gap-1 text-center">
								{profile.displayName ? (
									<div className="text-xl md:text-2xl font-bold">
										{profile.displayName}
									</div>
								) : (
									<div className="text-muted-foreground text-xl">
										Sin nombre
									</div>
								)}
								{profile.bio ? (
									<div className="text-sm md:text-base text-muted-foreground">
										{profile.bio}
									</div>
								) : (
									<div className="text-muted-foreground flex justify-center text-sm">
										No tienes bio
										<FrownIcon className="ml-2 h-4 w-4" />
									</div>
								)}
								<div className="flex flex-wrap items-center justify-center gap-2">
									{socials && socials.length > 0 ? (
										socials.map((social) => (
											<SocialMediaBadge
												key={social.id}
												socialMediaType={social.type}
												username={social.username}
												socialId={social.id}
												canBeDeleted
											/>
										))
									) : (
										<div className="text-muted-foreground text-sm">
											Sin redes agregadas
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</>
	);
}
