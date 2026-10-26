import { cn } from "@/app/lib/utils";

type RichTextHtmlProps = {
  html?: string | null;
  className?: string;
};

export default function RichTextHtml({ html, className }: RichTextHtmlProps) {
  if (!html?.trim()) return null;

  return (
    <div
      className={cn(
        "text-sm leading-relaxed text-foreground",
        "[&_a]:text-blue-500 dark:[&_a]:text-blue-400 [&_a]:underline",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_em]:italic [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold",
        // Comunicados' dividers (the announcement variant keeps `hr`).
        "[&_hr]:my-4 [&_hr]:border-border",
        // Images fit the column. A captioned one comes inside a `figure`,
        // which takes the spacing; one without a caption is a bare `img`.
        "[&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md",
        "[&_figure]:my-4 [&_figure_img]:my-0 [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground",
        "[&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_p:last-child]:mb-0",
        "[&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
