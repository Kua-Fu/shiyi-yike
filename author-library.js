export function authorKey(dynasty, name) {
  return `${dynasty}:${name}`;
}

export function poemMatchesAuthor(poem, name = "", dynasty = "") {
  return !name || (poem.author === name && (!dynasty || poem.dynasty === dynasty));
}

export function createAuthorChoices(poems) {
  const worksByAuthor = new Map();
  for (const poem of poems) {
    const key = authorKey(poem.dynasty, poem.author);
    const current = worksByAuthor.get(key) ?? {
      key,
      name: poem.author,
      dynasty: poem.dynasty,
      works: 0,
    };
    current.works += 1;
    worksByAuthor.set(key, current);
  }
  const nameCounts = new Map();
  for (const choice of worksByAuthor.values()) {
    nameCounts.set(choice.name, (nameCounts.get(choice.name) ?? 0) + 1);
  }
  const duplicatedNames = new Set(
    [...nameCounts].filter(([, count]) => count > 1).map(([name]) => name),
  );
  // 同名作者必须同时保留朝代，避免筛选“张潮”时把明、唐作品混成一个人。
  return [...worksByAuthor.values()]
    .map((choice) => ({
      ...choice,
      label: duplicatedNames.has(choice.name)
        ? `${choice.name} · ${choice.dynasty}`
        : choice.name,
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, "zh-CN") ||
        left.dynasty.localeCompare(right.dynasty, "zh-CN"),
    );
}
