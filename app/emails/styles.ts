export const main = {
  backgroundColor: "#ffffff",
  color: "#24292e",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
};

export const container = {
  maxWidth: "480px",
  margin: "0 auto",
  padding: "20px 0",
};

export const title = {
  fontSize: "24px",
  lineHeight: 1.25,
};

export const section = {
  padding: "24px",
  border: "solid 1px #dedede",
  borderRadius: "5px",
  textAlign: "center" as const,
};

export const text = {
  margin: "0 0 10px 0",
  textAlign: "left" as const,
};

export const button = {
  fontSize: "14px",
  backgroundColor: "#6320E2",
  color: "#fff",
  lineHeight: 1.5,
  borderRadius: "0.5em",
  padding: "10px 16px",
};

export const footer = {
  color: "#6a737d",
  fontSize: "10px",
  textAlign: "center" as const,
};

export const banner = {
  backgroundColor: "#6320E2",
  borderTopLeftRadius: "8px",
  borderTopRightRadius: "8px",
  height: "96px",
  width: "100%",
};

export const sectionWithBanner = {
  padding: "24px",
  border: "solid 1px #dedede",
  borderBottomLeftRadius: "8px",
  borderBottomRightRadius: "8px",
  textAlign: "center" as const,
};

export const titleWithBanner = {
  ...title,
  margin: "0px 0px 16px",
};

export const buttonWithBanner = {
  ...button,
  marginTop: "6px",
};

export const footerText = {
  margin: "0",
  textAlign: "center" as const,
};

export const standoutText = {
  padding: "16px",
  backgroundColor: "#f2f3f3",
  borderRadius: "4px",
  textAlign: "left" as const,
};
