import catalog from "../../../data/corpus/catalog.json";

export default function SourcesPage() {
  const domains = [...new Set(catalog.records.map((r) => r.domain))].sort();
  return (
    <div className="shell">
      <a className="skip-link" href="#source-catalog">
        Przejdź do katalogu źródeł
      </a>
      <header className="header">
        <a className="brand" href="/">
          KitCheck.
        </a>
        <a href="/">Weryfikacja WWW</a>
      </header>
      <main id="source-catalog" tabIndex={-1}>
        <section className="hero">
          <p className="eyebrow">KORPUS DEMONSTRACYJNY</p>
          <h1>Źródła pod kontrolą.</h1>
          <p>
            {catalog.records.length} rekordów · {domains.length} domen · źródła
            urzędowe i instytucjonalne oraz weryfikacje faktów.
          </p>
          <p>
            To katalog publikacji, nie lista gwarantująca prawdziwość
            informacji. Podczas sprawdzania system wyszukuje pasujące tytuły i
            pobiera tekst wybranych stron ponownie. Korzysta też z wyszukiwania
            WWW i publicznych API.
          </p>
          <p>
            Przechowujemy metadane i linki, bez pełnych artykułów. Brak daty
            publikacji oznaczamy jawnie. Nie deklarujemy licencji na ponowne
            rozpowszechnianie treści wydawców.
          </p>
          <a href="/api/corpus">Pobierz katalog JSON do audytu</a>
        </section>
        {domains.map((domain) => (
          <section
            className="panel"
            key={domain}
            style={{ marginBottom: "1rem" }}
          >
            <h2>{domain}</h2>
            <ul>
              {catalog.records
                .filter((r) => r.domain === domain)
                .map((record) => (
                  <li
                    key={record.id}
                    style={{ marginBottom: "1rem", overflowWrap: "anywhere" }}
                  >
                    <a href={record.url} target="_blank" rel="noreferrer">
                      {record.title}
                    </a>
                    <br />
                    <small>
                      {record.publisher} · Publikacja:{" "}
                      {record.publishedAt?.slice(0, 10) ?? "data nieustalona"} ·
                      Pobrano: {record.retrievedAt.slice(0, 10)}
                    </small>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
