import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  img: ({ alt }) => alt || null,
};

function sourceLink(value: string, sourceUrl?: string) {
  try {
    const url = new URL(value, sourceUrl);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    ) {
      return url.href;
    }
  } catch {
    return undefined;
  }
}

export function SourceQuote({
  text,
  sourceUrl,
}: {
  text: string;
  sourceUrl?: string;
}) {
  return (
    <blockquote className="source-quote">
      <Markdown
        components={components}
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(value, key) =>
          key === "href" ? sourceLink(value, sourceUrl) : undefined
        }
      >
        {text}
      </Markdown>
    </blockquote>
  );
}
