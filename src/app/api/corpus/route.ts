import catalog from "../../../../data/corpus/catalog.json";
export function GET() {
  return Response.json(catalog, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
