import CouponBookPrintPage from "@/app/components/festivals/festival_activities/coupon-book-print-page";
import { CouponBookPage } from "@/app/lib/festival_activites/coupon-book-builder";

type CouponBookPrintDocumentProps = {
	title: string;
	pages: CouponBookPage[];
};

export default function CouponBookPrintDocument({
	title,
	pages,
}: CouponBookPrintDocumentProps) {
	return (
		<div
			style={{
				background: "#f5f5f5",
				padding: "16px",
				display: "flex",
				flexDirection: "column",
				gap: "16px",
				width: "max-content",
			}}
		>
			<p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</p>
			{pages.map((page) => (
				<div key={`coupon-page-${page.pageNumber}`} style={{ breakAfter: "page" }}>
					<CouponBookPrintPage page={page} />
				</div>
			))}
		</div>
	);
}
