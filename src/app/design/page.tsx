import type { Metadata } from "next";
import { MobileDesign } from "./mobile-design";

export const metadata: Metadata = {
  title: "Makiety — KitCheck",
  robots: { index: false },
};

export default function DesignPage() {
  return <MobileDesign />;
}
