/**
 * Pull a parseable JSON value out of an LLM response that may be wrapped in
 * ```json fences, prefixed with commentary ("Here is the corrected JSON:"),
 * or trailed by prose. Strategy: return the substring spanning the outermost
 * `{ … }` (or `[ … ]`) bracket pair; fall back to the trimmed input.
 *
 * It does NOT parse — callers `JSON.parse` the result so they keep their own
 * error handling. Safe on partial/streaming text: it returns the best
 * candidate so far, and `JSON.parse` just fails until the value completes.
 */
export function extractJson(raw: string): string {
  const s = raw.trim();
  if (!s) return s;

  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");

  // Pick whichever bracket family opens first (objects are the common case).
  let open = firstObj;
  let close = s.lastIndexOf("}");
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    open = firstArr;
    close = s.lastIndexOf("]");
  }

  if (open !== -1 && close !== -1 && close > open) {
    return s.slice(open, close + 1);
  }
  return s;
}
