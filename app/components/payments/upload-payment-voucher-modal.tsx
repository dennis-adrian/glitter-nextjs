"use client";

import BaseModal from "@/app/components/modals/base-modal";
import UploadPaymentVoucherForm from "@/app/components/payments/forms/upload-payment-voucher-form";
import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { useEffect, useState } from "react";

type UploadPaymentVoucherModalProps = {
	invoice: InvoiceWithPaymentsAndStand;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};
export default function UploadPaymentVoucherModal(
	props: UploadPaymentVoucherModalProps,
) {
	const payments = props.invoice.payments;
	const existingVoucherUrl = payments[payments?.length - 1]?.voucherUrl;
	const [isUploadStarted, setIsUploadStarted] = useState(
		Boolean(existingVoucherUrl),
	);
	const [isUploading, setIsUploading] = useState(false);
	const [voucherUrl, setVoucherUrl] = useState<string | undefined>(
		existingVoucherUrl,
	);
	const [hasUserUploaded, setHasUserUploaded] = useState(false);

	useEffect(() => {
		if (hasUserUploaded) return;
		setIsUploadStarted(Boolean(existingVoucherUrl));
		setVoucherUrl(existingVoucherUrl);
	}, [existingVoucherUrl, hasUserUploaded]);

	useEffect(() => {
		if (!props.open) return;
		setHasUserUploaded(false);
	}, [props.open, props.invoice.id]);

	return (
		<BaseModal
			title="Comprobante de pago"
			show={props.open}
			onOpenChange={props.onOpenChange}
		>
			<div className="mt-4">
				<PaymentProofUpload
					voucherImageUrl={voucherUrl}
					onUploadComplete={(newUrl) => {
						setHasUserUploaded(true);
						setVoucherUrl(newUrl);
					}}
					onUploading={(isUploading) => {
						setIsUploadStarted(true);
						setIsUploading(isUploading);
					}}
				/>
				<UploadPaymentVoucherForm
					invoice={props.invoice}
					newVoucherUrl={voucherUrl}
					loading={isUploading}
					disabled={!isUploadStarted}
					hideSubmitButton={!isUploadStarted || isUploading}
				/>
			</div>
		</BaseModal>
	);
}
