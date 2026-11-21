import { load } from "cheerio";
import type { SearchHit } from "@/core/evidence";

export type SourceBatch = { hits: SearchHit[]; partial: boolean };

export function htmlText(html: string): string {
  const $ = load(html);
  $(
    "script,style,nav,header,footer,.mw-editsection,.reference,.references,.reflist,.navbox,.toc",
  ).remove();
  $("p,div,li,tr,h1,h2,h3,h4,section,br").append("\n\n");
  return $.root()
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}
