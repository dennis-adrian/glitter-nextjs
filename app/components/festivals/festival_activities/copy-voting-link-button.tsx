"use client";

import CopyToClipboardButton from "@/app/components/common/copy-to-clipboard-button";
import { useEffect, useState } from "react";

type CopyVotingLinkButtonProps = {
	festivalId: number;
	activityId: number;
};

export default function CopyVotingLinkButton({
	festivalId,
	activityId,
}: CopyVotingLinkButtonProps) {
	const path = `/festivals/${festivalId}/activity/${activityId}/voting`;
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		setUrl(window.location.origin + path);
	}, [path]);

	if (!url) {
		return null;
	}

	return (
		<CopyToClipboardButton
			text={url}
			toastLabel="Enlace de votación copiado al portapapeles"
			label="Copiar enlace de votación"
		/>
	);
}
