"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	children: React.ReactNode;
	title?: string;
}

export const Modal = ({ isOpen, onClose, children, title }: ModalProps) => {
	const modalRef = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setIsVisible(true);
		} else {
			setIsVisible(false);
		}
	}, [isOpen]);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener("keydown", handleEscape);
			document.body.style.overflow = "hidden";
		}

		return () => {
			document.removeEventListener("keydown", handleEscape);
			document.body.style.overflow = "unset";
		};
	}, [isOpen, onClose]);

	useEffect(() => {
		if (isOpen && modalRef.current) {
			modalRef.current.focus();
		}
	}, [isOpen]);

	if (!isOpen && !isVisible) return null;

	return createPortal(
		<div
			className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
				isVisible ? "bg-black bg-opacity-50" : "bg-transparent"
			}`}
			onClick={onClose}
		>
			<div
				ref={modalRef}
				className={`relative w-full max-w-lg transform rounded-lg bg-white p-6 shadow-xl transition-all duration-300 ${
					isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
				}`}
				onClick={(e) => e.stopPropagation()}
				tabIndex={-1}
			>
				{title && (
					<h2 className="mb-4 text-xl font-semibold text-gray-900">{title}</h2>
				)}
				<button
					className="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
					onClick={onClose}
					aria-label="Close modal"
				>
					<svg
						className="h-6 w-6"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
				<div className="max-h-[80vh] overflow-y-auto">{children}</div>
			</div>
		</div>,
		document.body,
	);
};
