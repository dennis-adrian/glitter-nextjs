import { Fragment, type CSSProperties, type ReactNode } from "react";
import { Heading, Hr, Img, Link, Section, Text } from "react-email";

import * as styles from "@/app/emails/styles";
import type {
  AnnouncementBlock,
  AnnouncementInline,
  AnnouncementText,
} from "@/app/lib/comunicados/content";
import { isSafeComunicadoActionPath } from "@/app/lib/comunicados/definitions";
import { comunicadoEmailHref } from "@/app/lib/comunicados/text";
import { isUploadThingFileUrl } from "@/app/lib/uploadthing/file-key";

export { comunicadoEmailHref };

/**
 * A comunicado's blocks as React Email nodes (docs/IMPLEMENTATION-comunicados.md
 * C3). Synchronous, like `blocksToSeedHtml`, so the bulk lane can render a
 * batch without BlockNote. Takes the blocks `normalizeAnnouncementDoc`
 * returned; every style is inline, since mail clients strip stylesheets.
 */

const paragraph: CSSProperties = {
  ...styles.text,
  fontSize: "15px",
  lineHeight: "24px",
};

const headings: Record<2 | 3, CSSProperties> = {
  2: {
    ...styles.text,
    fontSize: "20px",
    lineHeight: 1.3,
    fontWeight: 700,
    margin: "20px 0 8px 0",
  },
  3: {
    ...styles.text,
    fontSize: "17px",
    lineHeight: 1.3,
    fontWeight: 700,
    margin: "16px 0 6px 0",
  },
};

const quote: CSSProperties = {
  borderLeft: "3px solid #dedede",
  padding: "2px 0 2px 12px",
  margin: "0 0 10px 0",
};

const quoteText: CSSProperties = { ...paragraph, margin: 0, color: "#4b5563" };

const list: CSSProperties = {
  ...styles.text,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 10px 0",
  padding: "0 0 0 24px",
};

const nestedList: CSSProperties = { ...list, margin: "4px 0 0 0" };

const listItem: CSSProperties = { margin: "0 0 4px 0" };

/** Children of a block that is not a list item, indented under it. */
const nested: CSSProperties = { padding: "0 0 0 16px" };

const divider: CSSProperties = {
  border: "none",
  borderTop: "1px solid #dedede",
  margin: "16px 0",
};

const link: CSSProperties = { ...styles.email, textDecoration: "underline" };

/**
 * The body's width: a 480 px container less the section's 24 px padding and
 * 1 px border on each side (`styles.container`, `styles.sectionWithBanner`).
 */
const COMUNICADO_EMAIL_IMAGE_WIDTH = 430;

const image: CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: `${COMUNICADO_EMAIL_IMAGE_WIDTH}px`,
  height: "auto",
  margin: "16px 0",
};

/** The button's absolute URL: a Glitter path only, never another site (C6). */
export function comunicadoActionUrl(
  path: string | null | undefined,
  baseUrl: string,
): string | null {
  const trimmed = path?.trim();
  if (!trimmed || !isSafeComunicadoActionPath(trimmed)) return null;
  return comunicadoEmailHref(trimmed, baseUrl);
}

/** A soft line break (Shift+Enter) as a `<br>`: some clients ignore pre-line. */
function withBreaks(text: string): ReactNode {
  const lines = text.split("\n");
  if (lines.length === 1) return text;
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

function styledText(node: AnnouncementText, key: number): ReactNode {
  let content = withBreaks(node.text);
  if (node.styles.bold) content = <strong>{content}</strong>;
  if (node.styles.italic) content = <em>{content}</em>;
  return <Fragment key={key}>{content}</Fragment>;
}

function inline(
  nodes: readonly AnnouncementInline[] | undefined,
  baseUrl: string,
): ReactNode[] {
  return (nodes ?? []).map((node, index) => {
    if (node.type !== "link") return styledText(node, index);
    const inner = node.content.map(styledText);
    const href = comunicadoEmailHref(node.href, baseUrl);
    // A link that cannot go out keeps its words.
    if (!href) return <Fragment key={index}>{inner}</Fragment>;
    return (
      <Link key={index} href={href} style={link}>
        {inner}
      </Link>
    );
  });
}

function hasText(block: AnnouncementBlock) {
  return (block.content ?? []).some((node) =>
    (node.type === "link" ? node.content : [node]).some(
      (text) => text.text.trim().length > 0,
    ),
  );
}

function isListItem(block: AnnouncementBlock) {
  return block.type === "bulletListItem" || block.type === "numberedListItem";
}

function renderList(
  items: AnnouncementBlock[],
  depth: number,
  baseUrl: string,
  key: number,
): ReactNode {
  const Tag = items[0]!.type === "numberedListItem" ? "ol" : "ul";
  return (
    <Tag key={key} style={depth > 1 ? nestedList : list}>
      {items.map((item, index) => (
        <li key={index} style={listItem}>
          {inline(item.content, baseUrl)}
          {renderLevel(item.children, depth + 1, baseUrl)}
        </li>
      ))}
    </Tag>
  );
}

function renderBlock(
  block: AnnouncementBlock,
  depth: number,
  baseUrl: string,
  key: number,
): ReactNode {
  const children =
    block.children.length > 0 ? (
      <Section style={nested}>
        {renderLevel(block.children, depth + 1, baseUrl)}
      </Section>
    ) : null;

  switch (block.type) {
    case "divider":
      // A line holds no text, but what was indented under it does.
      return (
        <Fragment key={key}>
          <Hr style={divider} />
          {children}
        </Fragment>
      );
    case "image": {
      // Only a file uploaded to Glitter stays up as long as the mail does
      // (C4). Sending refuses any other; a draft's preview leaves it out,
      // as the inbox's sanitizer does.
      const url = String(block.props.url ?? "");
      const caption = String(block.props.caption ?? "");
      return (
        <Fragment key={key}>
          {isUploadThingFileUrl(url) ? (
            // Outlook ignores CSS widths on images; it needs pixels.
            <Img
              src={url}
              alt={caption}
              width={COMUNICADO_EMAIL_IMAGE_WIDTH}
              style={image}
            />
          ) : null}
          {children}
        </Fragment>
      );
    }
    case "heading": {
      const level = block.props.level === 3 ? 3 : 2;
      return (
        <Fragment key={key}>
          <Heading as={level === 3 ? "h3" : "h2"} style={headings[level]}>
            {inline(block.content, baseUrl)}
          </Heading>
          {children}
        </Fragment>
      );
    }
    case "quote":
      return (
        <Fragment key={key}>
          <Section style={quote}>
            <Text style={quoteText}>{inline(block.content, baseUrl)}</Text>
          </Section>
          {children}
        </Fragment>
      );
    case "paragraph":
      return (
        <Fragment key={key}>
          {/* An empty paragraph leaves no gap, as in the text part. */}
          {hasText(block) ? (
            <Text style={paragraph}>{inline(block.content, baseUrl)}</Text>
          ) : null}
          {children}
        </Fragment>
      );
    default:
      // Normalized blocks hold nothing else; a new type needs its own email
      // markup before it can be sent, rather than going out half-rendered.
      throw new Error(
        `Comunicado block type with no email rendering: ${block.type}`,
      );
  }
}

function renderLevel(
  blocks: readonly AnnouncementBlock[],
  depth: number,
  baseUrl: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index]!;
    if (isListItem(block)) {
      // A run of one kind of item is one list; another kind starts a new one.
      const items: AnnouncementBlock[] = [];
      while (blocks[index]?.type === block.type) {
        items.push(blocks[index]!);
        index += 1;
      }
      nodes.push(renderList(items, depth, baseUrl, nodes.length));
      continue;
    }
    nodes.push(renderBlock(block, depth, baseUrl, nodes.length));
    index += 1;
  }
  return nodes;
}

/**
 * C3's email walker: headings as `h2`/`h3`, paragraphs as `Text`, quotes as a
 * `Section` with a left border, dividers as `Hr`, images as `Img` with their
 * caption as the alt text, lists as `ul`/`ol` with inline padding, bold and
 * italic, and links with absolute URLs. It never emits `details`, `input`,
 * `figure` or `pre`.
 */
export function announcementBlocksToEmail(
  blocks: readonly AnnouncementBlock[],
  opts: { baseUrl: string },
): ReactNode[] {
  return renderLevel(blocks, 1, opts.baseUrl);
}
