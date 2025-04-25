import { BaseProfile, UserSocial } from "@/app/api/users/definitions";
import FacebookIcon from "@/app/icons/FacebookIcon";
import InstagramIcon from "@/app/icons/InstagramIcon";
import TikTokIcon from "@/app/icons/TikTokIcon";
import TwitterIcon from "@/app/icons/TwitterIcon";
import YouTubeIcon from "@/app/icons/YoutubeIcon";
import {
	faFacebook,
	faInstagram,
	faTiktok,
	faTwitter,
	faWhatsapp,
	faYoutube,
} from "@fortawesome/free-brands-svg-icons";

// This methods are meant to be used in both ui and sever
export function getUserName(user?: BaseProfile | null) {
	if (!user) return "";

	return (
		user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim()
	);
}

export function getProfileStatusLabel(status: BaseProfile["status"]) {
	switch (status) {
		case "verified":
			return "Verificado";
		case "pending":
			return "Por verificar";
		case "rejected":
			return "Rechazado";
		case "banned":
			return "Deshabilitado";
	}
}

export const socialsUrls = {
	instagram: "https://www.instagram.com/",
	tiktok: "https://www.tiktok.com/@",
	facebook: "https://www.facebook.com/",
	twitter: "https://www.twitter.com/",
	youtube: "https://www.youtube.com/",
	whatsapp: "https://wa.me/",
};

export const socialsIcons = {
	instagram: faInstagram,
	tiktok: faTiktok,
	facebook: faFacebook,
	twitter: faTwitter,
	youtube: faYoutube,
	whatsapp: faWhatsapp,
};

export const socialMediaIcons: Record<
	UserSocial["type"],
	(props: { className?: string; fill?: string }) => React.ReactNode
> = {
	instagram: InstagramIcon,
	tiktok: TikTokIcon,
	facebook: FacebookIcon,
	twitter: TwitterIcon,
	youtube: YouTubeIcon,
};

export const socialMediaOptions: {
	label: string;
	value: UserSocial["type"];
}[] = [
	{ label: "Instagram", value: "instagram" },
	{ label: "TikTok", value: "tiktok" },
	{ label: "Facebook", value: "facebook" },
	{ label: "Twitter", value: "twitter" },
	{ label: "YouTube", value: "youtube" },
];

export const usernameRegex = new RegExp(/^[a-zA-Z0-9_.-]+$/);
export const phoneRegex = new RegExp(/^\d{8}$/);
