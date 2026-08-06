const SEARCH_SEPARATORS = /[\p{P}\p{S}\s]+/gu;

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(SEARCH_SEPARATORS, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

export function searchTerms(value) {
  return normalizeSearchText(value)
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean);
}

export function prepareSearchRecord(record, metadata = {}) {
  const [id, text, excerpt] = Array.isArray(record)
    ? record
    : [record.id, record.text, record.excerpt];
  return {
    id,
    excerpt: String(excerpt ?? ""),
    ordinal: Number(metadata.ordinal) || 0,
    searchable: compactSearchText(text),
    title: compactSearchText(metadata.title),
    author: compactSearchText(metadata.author),
    tags: (metadata.tags ?? []).map(compactSearchText),
    excerptSearchable: compactSearchText(excerpt),
  };
}

function allTermsIn(value, terms) {
  return Boolean(value) && terms.every((term) => value.includes(term));
}

export function scorePreparedRecord(record, query, terms = searchTerms(query)) {
  const compactQuery = compactSearchText(query);
  if (record.title === compactQuery) return 140;
  if (record.author === compactQuery) return 130;
  if (allTermsIn(record.title, terms)) return 115;
  if (allTermsIn(record.author, terms)) return 105;
  if (record.tags.some((tag) => tag === compactQuery)) return 95;
  if (record.tags.some((tag) => allTermsIn(tag, terms))) return 85;
  if (record.excerptSearchable.includes(compactQuery)) return 70;
  if (allTermsIn(record.excerptSearchable, terms)) return 60;
  return 30;
}

export function searchPreparedRecords(records, query, { limit = 120 } = {}) {
  const terms = searchTerms(query);
  if (!terms.length) return { total: 0, terms: [], results: [] };

  const matches = records
    .filter((record) => terms.every((term) => record.searchable.includes(term)))
    .map((record) => ({
      id: record.id,
      excerpt: record.excerpt,
      score: scorePreparedRecord(record, query, terms),
      ordinal: record.ordinal,
    }))
    .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal);

  return {
    total: matches.length,
    terms,
    results: matches.slice(0, limit),
  };
}

export function highlightTextSegments(value, terms) {
  const characters = Array.from(String(value ?? ""));
  const compactCharacters = [];
  const sourceIndexes = [];
  characters.forEach((character, sourceIndex) => {
    for (const normalizedCharacter of compactSearchText(character)) {
      compactCharacters.push(normalizedCharacter);
      sourceIndexes.push(sourceIndex);
    }
  });

  const compactValue = compactCharacters.join("");
  const highlighted = Array(characters.length).fill(false);
  for (const rawTerm of terms ?? []) {
    const term = compactSearchText(rawTerm);
    if (!term) continue;
    let fromIndex = 0;
    while (fromIndex < compactValue.length) {
      const matchIndex = compactValue.indexOf(term, fromIndex);
      if (matchIndex < 0) break;
      const sourceStart = sourceIndexes[matchIndex];
      const sourceEnd = sourceIndexes[matchIndex + term.length - 1];
      for (let index = sourceStart; index <= sourceEnd; index += 1) highlighted[index] = true;
      fromIndex = matchIndex + Math.max(1, term.length);
    }
  }

  const segments = [];
  characters.forEach((character, index) => {
    const isHighlighted = highlighted[index];
    const latest = segments.at(-1);
    if (latest?.highlight === isHighlighted) latest.text += character;
    else segments.push({ text: character, highlight: isHighlighted });
  });
  return segments;
}
