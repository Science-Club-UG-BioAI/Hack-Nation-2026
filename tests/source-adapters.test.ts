import { expect, it } from "vitest";
import { htmlText } from "@/server/source-adapters";
it("preserves paragraphs and omits embedded script and style text", () => {
  expect(
    htmlText(
      "<p>First paragraph</p><script>hidden</script><p>Second paragraph</p><style>hidden</style>",
    ),
  ).toBe("First paragraph\n\nSecond paragraph");
});
