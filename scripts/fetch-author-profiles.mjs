import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenCC from "opencc-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authorDataPath = path.join(projectRoot, "data/authors.json");
const indexPath = path.join(projectRoot, "data/poems/index.json");
const outputPath = path.join(projectRoot, "data/sources/author-profiles.json");
const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });
const wikipediaApi = "https://zh.wikipedia.org/w/api.php";
const gushiwenAuthorUrl = "https://www.gushiwen.cn/authorv.aspx";
const userAgent = "shiyi-yike/1.4 (https://github.com/Kua-Fu/shiyi-yike)";
const retrievedAt = new Date().toISOString();

const dynastyTokens = new Map([
  ["先秦", ["先秦", "战国", "春秋", "周朝", "楚国"]],
  ["两汉", ["汉朝", "汉代", "西汉", "东汉", "两汉"]],
  ["东汉", ["东汉", "汉末", "建安"]],
  ["三国", ["三国", "曹魏", "蜀汉", "东吴", "魏国", "东汉末", "建安"]],
  ["魏晋", ["魏晋", "西晋", "东晋", "晋朝", "三国"]],
  [
    "南北朝",
    ["南北朝", "南朝", "北朝", "刘宋", "南齐", "梁朝", "陈朝", "北魏", "北齐", "北周"],
  ],
  ["唐", ["唐朝", "唐代", "五代", "十国"]],
  ["宋", ["宋朝", "宋代", "北宋", "南宋", "宋元", "金朝"]],
  ["元", ["元朝", "元代", "元人", "元曲", "元末", "金朝", "金代", "金元"]],
  ["明", ["明朝", "明代", "明初", "明末", "明人", "元末明初"]],
  ["清", ["清朝", "清代", "清初", "清末", "晚清", "明末清初"]],
]);

const nonPersonProfiles = new Map([
  [
    "汉乐府",
    "“汉乐府”是对汉代乐府机关所采集、制作乐歌及其文学传统的概称，并非单一作者。相关作品多反映征战、婚恋、劳作与社会生活，语言质朴，叙事性鲜明。",
  ],
  [
    "乐府诗集",
    "《乐府诗集》是北宋郭茂倩编纂的乐府歌辞总集，汇集上古至唐五代的歌谣与文人乐府。诗库以此署名时，表示作品据该书保存，具体作者已不可考。",
  ],
  [
    "晋书",
    "《晋书》是唐代房玄龄等奉敕编修的晋代纪传体史书。诗库以“晋书”署名时，表示作品由史书保存或转录，原作者未能确定，并非将史书视作个人作者。",
  ],
  [
    "《后汉书》",
    "《后汉书》是南朝宋范晔编撰的东汉纪传体史书。诗库以书名署名时，表示相关歌谣或诗句见载于该书，具体创作者已不可考。",
  ],
  [
    "民歌",
    "“民歌”指在民间长期传唱、经后人记录保存的歌辞，并非单一作者。南北朝民歌常以鲜明口语、地域风物和直率情感见长。",
  ],
  [
    "渔父",
    "“渔父”是古典诗歌中常见的匿名歌者与隐逸者形象，并非可以确考的单一作者。以此署名的作品多借江湖问答寄托出处之思。",
  ],
  [
    "佚名",
    "“佚名”表示作品的具体作者已经失考。此类篇章往往经民间传唱、文献抄录或后世选本保存，其时代背景与文学面貌仍可从文本和载录文献中考察。",
  ],
  [
    "美人虞",
    "“美人虞”通常指西楚霸王项羽宠姬虞姬。其生平记载极少，传世歌辞的作者归属亦有争议，因此诗库保留原资料中的传统署名。",
  ],
  [
    "京师妓",
    "“京师妓”是明代文献为一位姓名失载的歌妓所作的身份署名，并非完整姓名。其生平无从详考，作品因选本和诗话载录而流传。",
  ],
  [
    "李秀才",
    "“李秀才”是古代文献按姓氏与科举身份留下的署名，具体名讳与生平已经失考。诗库沿用原始载录中的称谓，以免将不确定身份误作定论。",
  ],
  [
    "秋江湛公",
    "秋江湛公是明代僧人的别号式署名，具体法名与生平记载有限。其诗作由选本保存，体现明代僧诗清幽疏淡的一面。",
  ],
  [
    "全室宗泐",
    "全室宗泐即明初高僧宗泐，号全室，曾奉诏参与佛典与礼仪事务，并以诗文见称。其诗多有山林行旅与禅门生活的内容。",
  ],
  [
    "高丽定法师",
    "高丽定法师是南北朝文献中以地域和僧职留下的署名，个人名讳、生卒与行迹均难确考。相关诗作见证了当时佛教文化交流。",
  ],
  [
    "伽腽肭",
    "伽腽肭是南北朝时期作品所见的音译署名，现存生平资料极少。诗库保留原始署名，并将其作品作为当时多族群文化交往的文学记录。",
  ],
  [
    "僧伽斯那",
    "僧伽斯那是南北朝时期来华僧人，汉文资料中的生平记载较少。其名下作品反映了佛教传播与中古文学交汇的历史背景。",
  ],
  [
    "魏胡太后",
    "魏胡太后即北魏宣武帝皇后胡氏、孝明帝生母，曾两度临朝听政。其相关歌辞与北魏宫廷政治及洛阳佛教文化相联系。",
  ],
  [
    "甄氏",
    "甄氏通常指魏文帝曹丕妻甄夫人，后追尊文昭皇后。她以才貌与文学传说著称，但题作其名下的部分诗篇存在作者归属争议。",
  ],
  [
    "宸濠翠妃",
    "宸濠翠妃是明代宁王朱宸濠宫中妃嫔的称谓，真实姓名和生平记载有限。其诗因宁王之乱相关文献而留存，署名沿用旧录。",
  ],
  [
    "道源",
    "道源是明代僧人使用的法号，现有材料难以据此唯一确定其俗姓、生卒与完整行迹。传世诗作呈现了山居、参禅与行旅题材。",
  ],
  [
    "今释",
    "今释是明末清初岭南诗僧，俗姓金，名堡，明亡后出家。其诗多寄托故国之思，与当时遗民文学关系密切。",
  ],
  [
    "永嘉诗丐",
    "“永嘉诗丐”是清代文献记录的一位姓名失载的流浪诗人称号。其生平难考，作品因地方文献和选本保存而得以流传。",
  ],
]);

const exactProfiles = new Map([
  [
    "南北朝:王褒(南北)",
    {
      biography:
        "王褒（约513—576），字子渊，琅邪临沂人，南北朝文学家、诗人。早年仕南朝梁，江陵陷落后入西魏、北周，官至太子少保；诗文多写羁旅与故国之思，与庾信并称。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://ctext.org/datawiki.pl?if=gb&remap=gb&res=589202",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "明:张潮",
    {
      biography:
        "张潮（1650—约1709），字山来，号心斋，安徽歙县人，明末清初文学家、刻书家。著有随笔集《幽梦影》，并编刻《虞初新志》等书；《二鹊救友》即见于其笔记类著述。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://www.gushiwen.cn/shiwenv_6f3a2689274d.aspx",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "魏晋:刘义庆",
    {
      biography:
        "刘义庆（403—444），字季伯，彭城人，南朝宋宗室、文学家。曾任荆州刺史等职，并召集门客编撰《世说新语》《幽明录》等书。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E5%8A%89%E7%BE%A9%E6%85%B6",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "魏晋:温子升",
    {
      biography:
        "温子升（496—547），字鹏举，济阴冤句人，北魏文学家，为北朝“三才”之一。其诗文在北朝颇负盛名，《捣衣诗》是传世代表作之一。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E6%BA%AB%E5%AD%90%E6%98%87",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "南北朝:王寂",
    {
      biography:
        "王寂（1128—1194），字元老，号拙轩，蓟州玉田人，金代文学家、官员。其诗文风格清峭疏畅，有《拙轩集》传世。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://www.gushiwen.cn/authorv.aspx?name=%E7%8E%8B%E5%AF%82",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "清:徐矶",
    {
      biography:
        "徐玑（1162—1214），字文渊，号灵渊，温州永嘉人，南宋诗人，与徐照、翁卷、赵师秀并称“永嘉四灵”。诗库原始资料将其姓名记作“徐矶”，小传保留正确人物信息以供核对。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E5%BE%90%E7%92%A3",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "清:王国维",
    {
      biography:
        "王国维（1877—1927），字静安，号观堂，浙江海宁人，近代学者、词人。其研究横跨文学、美学、古文字与古史，著有《人间词话》《观堂集林》等。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E7%8E%8B%E5%9C%8B%E7%B6%AD",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "宋:陈著",
    {
      biography:
        "陈著（1225—1308），字子微，号本堂，晚号嵩溪遗耄，庆元府鄞县人，宋元之际词人、学者和官员。宝祐四年进士，有《本堂先生文集》传世。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E9%99%88%E8%91%97",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "元:伯颜",
    {
      biography:
        "伯颜（1327—1379），字子中，先世来自西域，家于江西进贤，元末诗人。元亡后不仕明，曾隐姓浪游，晚年返乡。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E4%BC%AF%E9%A2%9C%E5%AD%90%E4%B8%AD",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "元:舒頔",
    {
      biography:
        "舒頔（1304—1377），字道原，号贞素，徽州绩溪人，元末明初文学家，亦擅隶书。曾任台州学正，后归隐著述，有《贞素斋集》传世。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E8%88%92%E9%A0%94",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "元:汤式",
    {
      biography:
        "汤式，字舜民，号菊庄，象山人，元末明初散曲家、戏曲家，生卒年不详。其散曲多写朝代更替、民生与人生感慨，作品收入《全元散曲》。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://m.gushiwen.cn/authorv_a636732f6e97.aspx",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "清:徐骏",
    {
      biography:
        "徐骏（？—1730），字冠卿，号坚蕉，江苏昆山人，清代文人，康熙五十二年进士。雍正八年因诗文被指讥讪而卷入文字狱，最终获罪被杀。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E5%BE%90%E9%A7%BF_(%E6%B8%85%E6%9C%9D)",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "明:张大复",
    {
      biography:
        "张大复（1554—1630），字元长，号病居士，苏州昆山人，明代文学家。晚年失明后仍口授著述，是晚明小品文的重要作家。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E5%BC%B5%E5%A4%A7%E5%BE%A9_(%E6%98%8E%E6%9C%9D)",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "清:陈衡恪",
    {
      biography:
        "陈衡恪（1876—1923），字师曾，号槐堂、朽道人，江西义宁人，近代画家、艺术教育家。其创作与论述推动了文人画在近代的传承。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E9%99%B3%E5%B8%AB%E6%9B%BE",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "魏晋:李密",
    {
      biography:
        "李密（224—287），字令伯，犍为武阳人，西晋文学家。早年仕蜀汉，入晋后以奉养祖母为由辞谢征召，其《陈情表》以情辞恳切著称。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E6%9D%8E%E5%AF%86_(%E8%A5%BF%E6%99%89)",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "明:程登吉",
    {
      biography:
        "程登吉，字允升，明末江西西昌人，生卒事迹记载不详。一般认为他是蒙学读物《幼学须知》的早期编著者，该书经后人增补后以《幼学琼林》之名广泛流传。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E5%B9%BC%E5%AD%B8%E7%93%8A%E6%9E%97",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "两汉:宋子侯",
    {
      biography:
        "宋子侯，东汉诗人，生平事迹已难详考。今存五言诗《董娇饶》一篇，借花木荣衰寄托对美好生命遭遇摧折的感慨。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E8%91%A3%E5%AC%8C%E9%A5%92",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "两汉:韦孟",
    {
      biography:
        "韦孟，西汉诗人，邹地人，曾任楚元王、楚夷王之傅。其《讽谏诗》以四言体陈述祖德并劝戒楚王，是汉代较早的文人诗作。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E9%9F%8B%E5%AD%9F",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "两汉:梁鸿",
    {
      biography:
        "梁鸿，字伯鸾，扶风平陵人，东汉文学家、隐士。过洛阳见宫室奢华，作《五噫歌》寄寓讽谏，后避居吴地；他与妻子孟光“举案齐眉”的故事亦为后世熟知。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E6%A2%81%E9%B8%BF_(%E4%B8%9C%E6%B1%89)",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "魏晋:释慧远",
    {
      biography:
        "慧远（334—416），俗姓贾，雁门楼烦人，东晋高僧。早年从道安受学，后长期住持庐山东林寺，组织译经与讲学，并与鸠摩罗什书信论义，对东晋佛教发展影响深远。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E6%85%A7%E9%81%A0",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "元:黄庚",
    {
      biography:
        "黄庚，字星甫，号天台山人，台州天台人，宋末元初诗人。早年习举子业，入元后未仕，晚年自编诗集《月屋漫稿》；其诗多写羁旅、山林与日常感怀。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://m.gushiwen.cn/authorv.aspx?name=%E9%BB%84%E5%BA%9A",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "明:陈铎",
    {
      biography:
        "陈铎，字大声，号秋碧，邳州人，家居南京，明代散曲家、诗人与画家。正德年间世袭指挥使，后归隐创作，著有散曲集《秋碧乐府》及《香月亭诗》等。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://www.gushiwen.cn/authorv_ced79d3d04c6.aspx",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "宋:黄升",
    {
      biography:
        "黄升，字叔旸，号玉林，又号花庵词客，建安人，南宋词人、词选编纂者。著有《散花庵词》，编成《绝妙词选》二十卷，后世合称《花庵词选》。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://m.gushiwen.cn/authorv_7d2f8b121618.aspx",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "元:任昱",
    {
      biography:
        "任昱，字则明，四明人，元代散曲家。与张可久、曹明善大致同时，一生未仕，足迹多在苏州、杭州一带；其小令清俊疏放，常写隐居与布衣生活。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://www.gushiwen.cn/GuShiWen_8c639e4771.aspx",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "元:盍西村",
    {
      biography:
        "盍西村，盱眙人，元代散曲家，生平记载有限，或与《录鬼簿》所载盍志学为同一人，但尚无定论。现存散曲多写景与隐逸生活，风格清新自然。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://www.gushiwen.cn/gushiwen_3deb9bd63f.aspx",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
  [
    "唐:蔡襄",
    {
      biography:
        "蔡襄（1012—1067），字君谟，兴化仙游人，北宋官员、书法家、茶学家与诗人，为“宋四家”之一，著有《茶录》《荔枝谱》等。诗库原始资料将其列入唐代，小传保留正确人物时代以供核对。",
      source: "本项目整理 · 公开资料核对",
      sourceUrl: "https://zh.wikipedia.org/wiki/%E8%94%A1%E8%A5%84",
      reuseMode: "facts-only-project-authored",
      profileStatus: "sourced",
    },
  ],
]);

const wikipediaEraExceptions = new Set([
  "魏晋:张载",
  "南北朝:王褒(南北)",
  "明:张潮",
]);

function compactText(value = "") {
  return toSimplified(String(value))
    .replace(/\[[^\]]*?编辑\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLookupName(value) {
  return compactText(value)
    .replace(/^《|》$/g, "")
    .replace(/\(.+?\)|（.+?）/g, "")
    .trim();
}

function decodeHtml(value = "") {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    )
    .replace(/&#(\d+);/g, (_, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 10)),
    )
    .replace(/&nbsp;|&#160;|　/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&middot;/g, "·");
}

function conciseBiography(value, maxLength = 360) {
  const text = compactText(value);
  if (text.length <= maxLength) return text;

  const draft = text.slice(0, maxLength);
  const punctuation = Math.max(
    draft.lastIndexOf("。"),
    draft.lastIndexOf("！"),
    draft.lastIndexOf("？"),
  );
  return punctuation >= 150 ? draft.slice(0, punctuation + 1) : `${draft}……`;
}

function authorKey(author) {
  return `${author.dynasty}:${author.name}`;
}

function roleFor(author, poems) {
  if (poems.some((poem) => poem.form === "散曲")) return "曲家";
  if (poems.some((poem) => poem.form === "词" || poem.category === "宋词")) return "词人";
  if (poems.some((poem) => poem.form === "辞赋")) return "辞赋家";
  return author.role || "诗人";
}

function dynastyMatches(author, text) {
  const tokens = dynastyTokens.get(author.dynasty) ?? [author.dynasty];
  return tokens.some((token) => text.includes(token));
}

const dynastyYearRanges = new Map([
  ["先秦", [-1200, -200]],
  ["两汉", [-230, 230]],
  ["东汉", [20, 230]],
  ["三国", [150, 300]],
  ["魏晋", [180, 430]],
  ["南北朝", [380, 610]],
  ["唐", [570, 930]],
  ["宋", [880, 1300]],
  ["元", [1180, 1410]],
  ["明", [1280, 1680]],
  ["清", [1580, 1930]],
]);

function biographyYears(value) {
  const opening = value.slice(0, 100).match(/[（(]([^）)]{1,48})[）)]/)?.[1];
  if (!opening) return [];
  const normalized = opening
    .replace(/(?:公元)?前\s*(\d{2,4})/g, (_, year) => String(-Number(year)))
    .replace(/[—–－~～至]/g, " ");
  return [
    ...normalized.matchAll(
      /-?\d{3,4}(?=\s*年|\s|$)|-?\d{2}(?=\s*年|\s|$)/g,
    ),
  ]
    .map((match) => Number(match[0]))
    .filter((year) => Number.isFinite(year));
}

function datesMatchDynasty(author, biography) {
  const range = dynastyYearRanges.get(author.dynasty);
  const years = biographyYears(biography);
  if (!range || !years.length) return false;
  const earliest = Math.min(...years);
  const latest = Math.max(...years);
  const midpoint = (earliest + latest) / 2;
  return midpoint >= range[0] - 10 && midpoint <= range[1] + 10;
}

function profileMatchesAuthor(author, biography) {
  return dynastyMatches(author, biography) || datesMatchDynasty(author, biography);
}

function wikipediaTextIsAboutAuthor(author, page, biography) {
  const lookupName = cleanLookupName(author.name);
  const title = compactText(page.title).replace(/[《》]/g, "");
  return (
    title.includes(lookupName) ||
    lookupName.includes(title) ||
    compactText(biography).slice(0, 72).includes(lookupName)
  );
}

function cleanWikipediaBiography(value) {
  const firstParagraph = String(value).split(/\n{2,}/)[0] ?? "";
  const proseStart = firstParagraph.search(/(?:其诗曰|作诗[：:]|诗云[：:])/);
  const prose = proseStart >= 0 ? firstParagraph.slice(0, proseStart) : firstParagraph;
  return conciseBiography(
    prose.replace(
      /[（(][A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]{1,18}[）)]/g,
      "",
    ),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function factualBiographyFromGushiwen(author, rawBiography, poems) {
  const lookupName = cleanLookupName(author.name);
  const opening = rawBiography.slice(0, 260);
  const dateText =
    opening.match(
      new RegExp(`^${escapeRegExp(lookupName)}\\s*[（(]([^）)]{1,42})[）)]`),
    )?.[1] ??
    opening.match(/[（(]([^）)]*\d{3,4}[^）)]{0,30})[）)]/)?.[1];
  const dates =
    dateText && /[\d？?]|生卒/.test(dateText)
      ? dateText
          .replace(/公元/g, "")
          .replace(/[~～－-]+/g, "—")
          .replace(/—+/g, "—")
          .replace(/\s+/g, "")
      : "";
  const era = new Map([
    ["先秦", "先秦"],
    ["两汉", "汉代"],
    ["东汉", "东汉"],
    ["三国", "三国"],
    ["魏晋", "魏晋"],
    ["南北朝", "南北朝"],
    ["唐", "唐代"],
    ["宋", "宋代"],
    ["元", "元代"],
    ["明", "明代"],
    ["清", "清代"],
  ]).get(author.dynasty) ?? author.dynasty;
  let occupations = [
    ...new Set(
      [...opening.matchAll(
        /(?:诗人|词人|曲家|散曲作家|戏曲家|文学家|史学家|经学家|思想家|政治家|军事家|书法家|画家|学者|天文学家|目录学家|小说家|僧人)/g,
      )].map((match) => match[0]),
    ),
  ].slice(0, 4);
  if (occupations.includes("散曲作家")) {
    occupations = occupations.filter((item) => item !== "曲家");
  }
  if (!occupations.some((item) => /诗人|词人|曲家|散曲|文学家|戏曲家|小说家/.test(item))) {
    occupations.unshift(roleFor(author, poems));
  }

  const courtesyName = opening.match(/(?:^|[，。；])字([^，。；（）()]{1,14})/)?.[1];
  const artName = opening.match(/(?:^|[，。；])(?:自号|晚号|号)([^，。；（）()]{1,22})/)?.[1];
  const geographicClause = opening
    .split(/[，。；]/)
    .map((clause) =>
      clause
        .trim()
        .replace(/^[（(][^）)]*\d{3,4}[^）)]*[）)]\s*/, ""),
    )
    .find(
      (clause) =>
        clause.endsWith("人") &&
        clause.length >= 3 &&
        clause.length <= 38 &&
        !/[（）()]/.test(clause) &&
        !/^(?:汉族|满族|蒙古族|回族|生卒年不详|治所|其先|祖籍|父祖)/.test(clause) &&
        /(?:州|府|县|郡|京|阳|江|山|湖|川|苏|浙|徽|陕|河|辽|闽|粤|赣|鲁|豫|冀|晋|桂|云|贵|大都|临安|长安|金陵|会稽|吴中|关中)/.test(
          clause,
        ),
    );
  const poemTitles = [...new Set(poems.map((poem) => poem.title))].slice(0, 3);

  const sentences = [
    `${author.name}${dates ? `（${dates}）` : ""}，${era}${occupations.join("、")}。`,
  ];
  const identity = [
    courtesyName ? `字${courtesyName}` : "",
    artName ? `号${artName}` : "",
    geographicClause ?? "",
  ].filter(Boolean);
  if (identity.length) sentences.push(`${identity.join("，")}。`);

  if (poemTitles.length) {
    sentences.push(`“诗意一刻”收录其《${poemTitles.join("》《")}》等作品。`);
  }
  return sentences.join("");
}

async function fetchWithRetry(url, options = {}, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: { "User-Agent": userAgent, ...options.headers },
    });
    if (response.ok) return response;
    if (attempt === attempts || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`资料请求失败：${response.status} ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw new Error(`资料请求失败：${url}`);
}

async function fetchWikipediaProfiles(authors) {
  const names = [...new Set(authors.map((author) => cleanLookupName(author.name)))];
  const pages = new Map();
  const redirects = new Map();

  // extracts 接口的匿名请求上限为每批 20 个页面，分批可避免静默漏掉简介。
  for (let index = 0; index < names.length; index += 20) {
    const batch = names.slice(index, index + 20);
    const url = new URL(wikipediaApi);
    for (const [key, value] of Object.entries({
      action: "query",
      titles: batch.join("|"),
      prop: "extracts|description|pageprops|info",
      exintro: "1",
      explaintext: "1",
      exlimit: "max",
      redirects: "1",
      format: "json",
      origin: "*",
    })) {
      url.searchParams.set(key, value);
    }

    const response = await fetchWithRetry(url);
    const data = await response.json();
    for (const redirect of data.query?.redirects ?? []) {
      redirects.set(compactText(redirect.from), compactText(redirect.to));
    }
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (
        page.missing ||
        page.pageprops?.disambiguation !== undefined ||
        !compactText(page.extract)
      ) {
        continue;
      }
      pages.set(compactText(page.title), page);
    }
  }

  const profiles = new Map();
  for (const author of authors) {
    const lookupName = cleanLookupName(author.name);
    const pageTitle = redirects.get(lookupName) ?? lookupName;
    const page = pages.get(pageTitle);
    if (!page || wikipediaEraExceptions.has(authorKey(author))) continue;

    const biography = cleanWikipediaBiography(page.extract);
    if (
      !wikipediaTextIsAboutAuthor(author, page, biography) ||
      !profileMatchesAuthor(author, biography)
    ) {
      continue;
    }
    profiles.set(authorKey(author), {
      biography,
      source: "维基百科 · 中文版",
      sourceTitle: page.title,
      sourceUrl: `https://zh.wikipedia.org/w/index.php?title=${encodeURIComponent(
        page.title.replaceAll(" ", "_"),
      )}&oldid=${page.lastrevid}`,
      sourceRevisionId: page.lastrevid,
      retrievedAt,
      attribution: "中文维基百科贡献者",
      sourceLicense: "CC BY-SA 4.0",
      sourceLicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      reuseMode: "adapted-excerpt",
      sourceChanges: ["繁简转换", "编辑标记清理", "空白规范化", "篇幅节选"],
      profileStatus: "sourced",
    });
  }
  return profiles;
}

async function fetchGushiwenProfile(author, poems) {
  const lookupName = cleanLookupName(author.name);
  const url = new URL(gushiwenAuthorUrl);
  url.searchParams.set("name", lookupName);
  const response = await fetchWithRetry(url, {
    headers: { "User-Agent": `Mozilla/5.0 ${userAgent}` },
  });
  const html = await response.text();
  const title = compactText(
    decodeHtml(html.match(/<title>\s*([\s\S]*?)\s*<\/title>/i)?.[1] ?? ""),
  );
  if (!title.includes(lookupName)) return undefined;

  const textarea = html.match(
    /<textarea[^>]+id="txtareAuthor\d+"[^>]*>([\s\S]*?)<\/textarea>/i,
  )?.[1];
  const rawBiography = compactText(
    decodeHtml(textarea ?? "")
      .replace(/https?:\/\/\S+\s*$/, "")
      .replace(/<[^>]+>/g, ""),
  );
  // 作者页已由姓名精确检索；时代标签有时使用“建安”“金元”“近代”等交界说法，
  // 不再据本地诗库的单一朝代标签拒收，否则会把刘义庆、元好问、王国维等正确资料误删。
  if (rawBiography.length < 12 || !profileMatchesAuthor(author, rawBiography)) return undefined;

  const sourceUrl =
    compactText(decodeHtml(textarea ?? "")).match(/https?:\/\/\S+\s*$/)?.[0] ??
    url.toString();
  return {
    biography: factualBiographyFromGushiwen(author, rawBiography, poems),
    source: "本项目整理 · 公开资料核对",
    sourceUrl,
    retrievedAt,
    researchReference: "古文岛 · 原古诗文网",
    reuseMode: "facts-only-project-authored",
    sourceTransform: "仅提取年代、字号、籍贯、身份与著作等事实，并以本项目模板重新表述",
    profileStatus: "sourced",
  };
}

async function fetchGushiwenProfiles(authors, poemsByAuthor) {
  const profiles = new Map();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (cursor < authors.length) {
        const index = cursor;
        cursor += 1;
        const author = authors[index];
        try {
          const profile = await fetchGushiwenProfile(
            author,
            poemsByAuthor.get(authorKey(author)) ?? [],
          );
          if (profile) profiles.set(authorKey(author), profile);
        } catch (error) {
          console.warn(`! ${author.dynasty}·${author.name}：${error.message}`);
        }
      }
    }),
  );
  return profiles;
}

function limitedProfile(author, poems) {
  const special =
    nonPersonProfiles.get(author.name) ?? nonPersonProfiles.get(cleanLookupName(author.name));
  if (special) {
    return {
      biography: special,
      source: "公开资料与载录文献整理",
      profileStatus: "limited-record",
    };
  }

  const role = roleFor(author, poems);
  const titles = [...new Set(poems.map((poem) => poem.title))].slice(0, 3);
  const works =
    titles.length === 1
      ? `传世作品可见《${titles[0]}》`
      : `本诗库收录《${titles.join("》《")}》等作品`;
  return {
    biography:
      `${author.name}，${author.dynasty}${role}，生卒与详细行迹在现存公开资料中记载较少。` +
      `${works}；这些篇章是了解其创作面貌的直接材料。`,
    source: "公开资料检索与诗库作品整理",
    profileStatus: "limited-record",
  };
}

const [authorData, index] = await Promise.all([
  fs.readFile(authorDataPath, "utf8").then(JSON.parse),
  fs.readFile(indexPath, "utf8").then(JSON.parse),
]);
const existingKeys = new Set();
try {
  const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
  for (const profile of existing.profiles ?? []) existingKeys.add(authorKey(profile));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const targets = authorData.authors.filter(
  (author) =>
    existingKeys.has(authorKey(author)) ||
    !["唐", "宋"].includes(author.dynasty) ||
    author.profileStatus !== "sourced" ||
    author.biography.includes("现有开放作者语料尚未提供"),
);
const poemsByAuthor = new Map();
for (const poem of index.poems) {
  const key = `${poem.dynasty}:${poem.author}`;
  const poems = poemsByAuthor.get(key) ?? [];
  poems.push(poem);
  poemsByAuthor.set(key, poems);
}

console.log(`正在联网检索 ${targets.length} 位作者资料…`);
const wikipediaProfiles = await fetchWikipediaProfiles(targets);
const unresolved = targets.filter((author) => !wikipediaProfiles.has(authorKey(author)));
const gushiwenProfiles = await fetchGushiwenProfiles(unresolved, poemsByAuthor);

const profiles = targets
  .map((author) => {
    const key = authorKey(author);
    const profile =
      exactProfiles.get(key) ??
      wikipediaProfiles.get(key) ??
      gushiwenProfiles.get(key) ??
      limitedProfile(author, poemsByAuthor.get(key) ?? []);
    return { dynasty: author.dynasty, name: author.name, ...profile };
  })
  .sort(
    (left, right) =>
      left.dynasty.localeCompare(right.dynasty, "zh-CN") ||
      left.name.localeCompare(right.name, "zh-CN"),
  );

const result = {
  generatedAt: new Date().toISOString(),
  sources: [
    {
      name: "维基百科 · 中文版",
      url: "https://zh.wikipedia.org/",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      attribution: "中文维基百科贡献者（逐条来源页及历史记录）",
      reuseMode: "adapted-excerpt",
      changes: ["繁简转换", "编辑标记清理", "空白规范化", "篇幅节选"],
    },
    {
      name: "古文岛 · 原古诗文网",
      url: "https://www.gushiwen.cn/",
      usage: "仅用于核对年代、字号、籍贯、身份与著作等事实；人物小传由本项目重新组织表述",
      reuseMode: "facts-only-project-authored",
    },
  ],
  counts: {
    total: profiles.length,
    wikipedia: profiles.filter((profile) => profile.source === "维基百科 · 中文版").length,
    gushiwen: profiles.filter((profile) => profile.researchReference === "古文岛 · 原古诗文网")
      .length,
    limitedRecord: profiles.filter((profile) => profile.profileStatus === "limited-record")
      .length,
  },
  profiles,
};

await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `✓ 已补充 ${result.counts.total} 位作者：维基百科 ${result.counts.wikipedia} 位，` +
    `古文岛 ${result.counts.gushiwen} 位，有限记载 ${result.counts.limitedRecord} 位`,
);
