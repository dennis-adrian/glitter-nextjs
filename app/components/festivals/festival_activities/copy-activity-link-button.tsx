"use client";

import CopyToClipboardButton from "@/app/components/common/copy-to-clipboard-button";
import { useEffect, useState } from "react";

type CopyActivityLinkButtonProps = {
	festivalId: number;
	activityId: number;
};

export default function CopyActivityLinkButton({
	festivalId,
	activityId,
}: CopyActivityLinkButtonProps) {
	const path = `/festivals/${festivalId}/activity/${activityId}`;
	const [url, setUrl] = useState(path);

	useEffect(() => {
		setUrl(window.location.origin + path);
	}, [path]);

	return (
		<CopyToClipboardButton
			text={url}
			toastLabel="Enlace copiado al portapapeles"
			label="Copiar enlace para participar"
		/>
	);
}
