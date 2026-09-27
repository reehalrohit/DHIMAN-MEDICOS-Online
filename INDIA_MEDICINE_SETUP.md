# Dhiman Medicos — India Medicine Search

This package was prepared from the uploaded **Common Drug Codes for India (CDCI) Flat File Package** from C-DAC/NRCeS.

## Included

- `public/india-medicine-index.json`
  - 93,089 unique CDCI brand-name records
  - Generic-name references where available
- `app/api/india-medicine/search/route.js`
  - Server-side Indian medicine search endpoint

## Install

Copy the two paths into the root of the Dhiman Medicos Next.js repository:

```text
public/india-medicine-index.json
app/api/india-medicine/search/route.js
```

The endpoint is:

```text
/api/india-medicine/search?q=Rosub
```

It returns Indian CDCI matches and does not use RxNorm.

## Page integration

In `app/page.js`, replace the existing RxNorm state:

```js
const [rxnormMatches, setRxnormMatches] = useState([]);
```

with:

```js
const [indiaMatches, setIndiaMatches] = useState([]);
```

Replace the RxNorm `useEffect` with:

```js
useEffect(() => {
  const q = query.trim();

  if (q.length < 2) {
    setIndiaMatches([]);
    return;
  }

  let cancelled = false;

  const timer = setTimeout(async () => {
    try {
      const response = await fetch(
        `/api/india-medicine/search?q=${encodeURIComponent(q)}`
      );

      const data = await response.json();

      if (!cancelled) {
        setIndiaMatches(
          data.success ? data.matches || [] : []
        );
      }
    } catch {
      if (!cancelled) {
        setIndiaMatches([]);
      }
    }
  }, 300);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}, [query]);
```

Then replace the current RxNorm JSX with:

```jsx
{indiaMatches.length > 0 && query.trim().length >= 2 && (
  <section
    style={{
      maxWidth: "1100px",
      margin: "0 auto 14px",
      padding: "0 20px",
    }}
  >
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5dfd3",
        borderRadius: "18px",
        padding: "14px 16px",
      }}
    >
      <strong>💊 Indian medicine matches</strong>

      <div style={{ marginTop: "10px" }}>
        {indiaMatches.map((match, index) => (
          <button
            key={`${match.name}-${index}`}
            type="button"
            onClick={() => setQuery(match.name)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: 0,
              background: "transparent",
              padding: "9px 4px",
              cursor: "pointer",
            }}
          >
            <strong>{match.name}</strong>

            {match.generic && (
              <small
                style={{
                  display: "block",
                  color: "#718078",
                  marginTop: "2px",
                }}
              >
                Generic: {match.generic}
              </small>
            )}
          </button>
        ))}
      </div>

      <small
        style={{
          display: "block",
          marginTop: "8px",
          color: "#718078",
        }}
      >
        Reference data: Common Drug Codes for India (CDCI),
        C-DAC / NRCeS. This is reference data, not stock or
        availability information.
      </small>
    </div>
  </section>
)}
```

## Important

Do **not** use CDCI to determine:

- price
- stock
- availability
- your pharmacy's inventory
- whether an item can be ordered

Those continue to come from the existing Dhiman Medicos catalogue/Supabase system.

## License / attribution

The uploaded CDCI package states that the Common Drug Codes for India Flat Files Package is produced by NRCeS at C-DAC, Pune under Creative Commons Attribution 4.0 International, with additional SNOMED CT licensing terms. Brand/trade names remain the property of their respective owners.

Use the supplied `License.txt` from the original package for the complete terms.
