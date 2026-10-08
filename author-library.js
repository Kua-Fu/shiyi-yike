export function authorKey(dynasty, name) {
  return `${dynasty}:${name}`;
}

// 称号依据北京市语言文字工作委员会办公室的唐诗称号列表。
export const AUTHOR_EPITHET_SOURCE_URL = "https://jw.beijing.gov.cn/language/ywsh/201612/t20161219_1056554.html";
const AUTHOR_EPITHETS = new Map([
  ["唐:陈子昂", "诗骨"],
  ["唐:王昌龄", "七绝圣手"],
  ["唐:李白", "诗仙"],
  ["唐:杜甫", "诗圣"],
  ["唐:孟郊", "诗囚"],
  ["唐:贾岛", "诗奴"],
  ["唐:刘禹锡", "诗豪"],
  ["唐:王维", "诗佛"],
  ["唐:白居易", "诗魔"],
  ["唐:刘长卿", "五言长城"],
  ["唐:李贺", "诗鬼"],
  ["唐:岑参", "诗雄"],
  ["唐:李商隐", "七律圣手"],
]);

export function authorEpithet(dynasty, name) {
  return AUTHOR_EPITHETS.get(authorKey(dynasty, name)) ?? "";
}

export function authorSearchText(author) {
  return `${author.name} ${author.dynasty} ${author.epithet ?? authorEpithet(author.dynasty, author.name)}`;
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
      epithet: authorEpithet(poem.dynasty, poem.author),
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
      label: [
        choice.name,
        ...(duplicatedNames.has(choice.name) ? [choice.dynasty] : []),
        ...(choice.epithet ? [choice.epithet] : []),
      ].join(" · "),
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, "zh-CN") ||
        left.dynasty.localeCompare(right.dynasty, "zh-CN"),
    );
}
