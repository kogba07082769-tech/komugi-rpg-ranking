import tmi from "tmi.js";
import fs from "fs";
import { ApiClient } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

// =========================
// 💬 TMI.js 設定（Bot接続）
// =========================
const client = new tmi.Client({
  options: { debug: true },
  connection: { reconnect: true },
  identity: {
    username: process.env.BOT_NAME,
    password: process.env.OAUTH_TOKEN,
  },
  channels: [process.env.CHANNEL],
});

client.connect();

// =========================
// 🔐 Twitch 認証設定
// =========================
// =========================
// 🔐 Twitch 認証設定
// =========================
const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;
const accessToken = process.env.TWITCH_ACCESS_TOKEN;
const refreshToken = process.env.TWITCH_REFRESH_TOKEN;
const broadcasterId = process.env.TWITCH_BROADCASTER_ID;

const authProvider = new RefreshingAuthProvider(
  {
    clientId,
    clientSecret,
    onRefresh: async ({ accessToken, refreshToken }) => {
      const envText = `CHANNEL=${process.env.CHANNEL}
BOT_NAME=${process.env.BOT_NAME}
OAUTH_TOKEN=${process.env.OAUTH_TOKEN}
TWITCH_CLIENT_ID=${clientId}
TWITCH_CLIENT_SECRET=${clientSecret}
TWITCH_ACCESS_TOKEN=${accessToken}
TWITCH_REFRESH_TOKEN=${refreshToken}
TWITCH_BROADCASTER_ID=${broadcasterId}
SLIME_REWARD_ID=${process.env.SLIME_REWARD_ID}
SKELETON_REWARD_ID=${process.env.SKELETON_REWARD_ID}
DRAGON_REWARD_ID=${process.env.DRAGON_REWARD_ID}
SKILL_GACHA_REWARD_ID=${process.env.SKILL_GACHA_REWARD_ID}`;
      fs.writeFileSync(".env", envText);
      console.log("🔁 アクセストークンを更新しました");
    },
  },
  {
    accessToken,
    refreshToken,
    expiresIn: null,
    obtainmentTimestamp: null,
  }
);

// ✅ 配信者（ユーザー）をAuthProviderに登録 ← これが重要！
 authProvider.addUser(broadcasterId, {
  accessToken,
  refreshToken,
  expiresIn: null,
  obtainmentTimestamp: null,
  scope: [
    'chat:read',
    'chat:edit',
    'channel:read:redemptions',
    'channel:manage:redemptions'
  ],
});



  const apiClient = new ApiClient({ authProvider });

  // =========================
// ⚡ EventSub 設定
// =========================

// listener 作成（v7.4.0では authProvider も必要）
const listener = new EventSubWsListener({
  apiClient,
  authProvider,
});

// ✅ 古い購読を削除（409エラー防止）
const subs = await apiClient.eventSub.getSubscriptions();
for (const sub of subs.data) {
  if (sub.type === "channel.channel_points_custom_reward_redemption.add") {
    await apiClient.eventSub.deleteSubscription(sub.id);
    console.log(`🗑️ 古い購読を削除: ${sub.id}`);
  }
}

// ✅ EventSub 起動
await listener.start();

// =========================
// 🎁 チャンネルポイント報酬リスナー
// =========================

// クールタイム設定（秒）
const cooldowns = {
  "スライム討伐": 120,
  "スケルトン討伐": 300,
};

// 最後の使用時刻を記録
const lastUsed = new Map();

listener.onChannelRedemptionAdd(broadcasterId, (event) => {
  const user = event.userDisplayName;
  const reward = event.rewardTitle;
  const channel = `#${process.env.CHANNEL}`;
  const now = Date.now() / 1000; // 秒単位
  console.log(`🎁 ${user} が報酬「${reward}」を使用しました`);

  // クールタイム対象の報酬ならチェック
  if (cooldowns[reward]) {
    const key = `${user}_${reward}`;
    const last = lastUsed.get(key) || 0;
    const diff = now - last;

    if (diff < cooldowns[reward]) {
      const remaining = Math.ceil(cooldowns[reward] - diff);
      client.say(channel, `⏳ ${user}、${reward} はあと ${remaining} 秒待ってね！`);
      return; // クールタイム中なら中断
    }

    // クールタイム更新
    lastUsed.set(key, now);
  }

  // ==============================
  // 🎮 コマンド実行部分
  // ==============================
  if (reward.includes("スライム討伐")) {
    handleCommand(user, "！スライム");
  } else if (reward.includes("スケルトン討伐")) {
    handleCommand(user, "！スケルトン");
  } else if (reward.includes("ドラゴン討伐")) {
    handleCommand(user, "！ドラゴン");
  } else if (reward.includes("スキルガチャ")) {
    handleCommand(user, "！スキルガチャ");
  } else if (reward.includes("ログインガチャ")) {
    // 💎 1日1回限定ガチャ
    handleCommand(user, "！スキルガチャ");
  }
});


// ================================
// 🧩 handleCommand 関数
// ================================
function handleCommand(username, cmd) {
  const channel = `#${process.env.CHANNEL}`;
  // 仮想的にチャットメッセージを処理
  client.emit("message", channel, { "display-name": username }, cmd, false);
}



// ================================
// 🔧 基本設定
// ================================
const CHANNEL = "komugi5656";
const BOT_NAME = "komugirpgbot";
const OAUTH_TOKEN = "oauth:rnpmqo4pf6xtu5u8lcnugyjbre85r1"; // 本番用トークン

// ================================
// 🎮 プレイヤーデータ管理
// ================================
let playerData = {};
const saveFile = "./players.json";
if (fs.existsSync(saveFile)) {
  playerData = JSON.parse(fs.readFileSync(saveFile));
}

function getTotalEquipStats(player) {
  if (!player.equipment || player.equipment.length === 0) {
    return { attack: 0, crit: 0, add: 0, drop: 0 };
  }

  return player.equipment.reduce(
    (total, eq) => {
      total.attack += eq.attack || 0;
      total.crit += eq.critRate || 0;
      total.add += eq.addAttackRate || 0;
      total.drop += eq.dropRate || 0;
      return total;
    },
    { attack: 0, crit: 0, add: 0, drop: 0 }
  );
}


function saveData() {
  // メインセーブ
  fs.writeFileSync(saveFile, JSON.stringify(playerData, null, 2));

  // 💾 バックアップフォルダ作成（なければ自動生成）
  const backupDir = "./backup";
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  // 💾 日時入りバックアップファイル名
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-"); // ファイル名に使えない文字を置換
  const backupFile = `${backupDir}/players-${timestamp}.json`;

  // バックアップ保存
  fs.writeFileSync(backupFile, JSON.stringify(playerData, null, 2));

  // 🔁 古いバックアップを自動削除（最新5件のみ残す）
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith("players-"))
    .sort((a, b) => fs.statSync(`${backupDir}/${b}`).mtime - fs.statSync(`${backupDir}/${a}`).mtime);

  while (backups.length > 15) {
    const oldFile = backups.pop();
    fs.unlinkSync(`${backupDir}/${oldFile}`);
    console.log(`🧹 古いバックアップを削除: ${oldFile}`);
  }

  console.log(`💾 データ保存＆バックアップ完了 (${backupFile})`);
}

function ensurePlayer(username) {
  const channel = `#${process.env.CHANNEL}`;

  // 既存プレイヤーならそのまま
  if (playerData[username]) return;

  // 🎉 新規プレイヤー登録
  playerData[username] = {
    level: 1,
    exp: 0,
    attack: 1,
    equipment: [],
    skills: [],
    prestigeCount: 0,
    dragonHP: 100,
  };

  // 🌟 初回プレイヤーメッセージ（1回だけ）
  const introMessage = `
🌍 ${username} の冒険が始まった！
小さな村を旅立ち、魔物たちとの戦いが幕を開ける──`;

  client.say(channel, introMessage);
  saveData();
}
// ================================
// ⚔️ 敵設定
// ================================
const enemies = {
  "スライム": { exp: 5 },
  "スケルトン": { exp: 15 },
  "ドラゴン": { exp: 0 },
};

// ドロップ率の設定
const dropRate = {
  "スライム": 0.1,   // スライムの装備ドロップ率（10%）
  "スケルトン": 0.25 // スケルトンの装備ドロップ率（25%）
};

// ================================
// 💫 スキル排出設定
// ================================
const skillPool = [
  { rarity: "N", name: "斬撃の心得", effect: "攻撃＋1", attack: 1, rate: 21.0 },
  { rarity: "N", name: "学びの初歩", effect: "経験値ボーナス＋1", expBonus: 1, rate: 21.0 },
  { rarity: "R", name: "戦士の記憶", effect: "攻撃＋2", attack: 2, rate: 17.5 },
  { rarity: "R", name: "熟練の知恵", effect: "経験値ボーナス＋2", expBonus: 2, rate: 17.5 },
  { rarity: "SR", name: "閃光の一撃", effect: "クリティカル率＋1%", critRate: 1, rate: 7.5 },
  { rarity: "SR", name: "ひらめきの瞬間", effect: "経験値クリティカル＋1%", expBonus: 1, rate: 7.5 },
  { rarity: "UR", name: "英雄の魂", effect: "攻撃＋10", attack: 10, rate: 1.5 },
  { rarity: "UR", name: "知恵の結晶", effect: "経験値ボーナス＋10", expBonus: 10, rate: 1.5 },
  { rarity: "UR", name: "勇者の勘", effect: "クリティカル率＋3%", critRate: 3, rate: 1.5 },
  { rarity: "UR", name: "武神の閃光", effect: "攻撃追加率＋1%", addAttackRate: 1, rate: 1.5 },
  { rarity: "LR", name: "幸運の加護", effect: "装備ドロップ率＋1%", dropRate: 1, rate: 1.2 },
  { rarity: "MR", name: "限界突破", effect: "Lvアップ時攻撃上昇値＋1", attackGrowth: 1, rate: 0.5 },
  { rarity: "GR", name: "創世の力", effect: "攻撃＋100", attack: 100, rate: 0.0267 },
  { rarity: "GR", name: "時の叡智", effect: "経験値ボーナス＋100", expBonus: 100, rate: 0.0267 },
  { rarity: "GR", name: "神速の閃光", effect: "攻撃追加率＋10%", addAttackRate: 10, rate: 0.0267 },
  { rarity: "EX", name: "運命の断罪", effect: "ドラゴン即死率＋1%", dragonKill: 1, rate: 0.02 },
];

// ================================
// 🗡️ 装備設定（統一版）
// ================================
const equipmentPool = [
  { rarity: "N",  rate: 40, prefix: ["古びた", "鉄の", "錆びた"], base: ["ソード","ランス","アックス","ダガー","ロッド","ボウ"], attackMin: 1, attackMax: 2 },
  { rarity: "R",  rate: 30, prefix: ["鋭い", "頑丈な", "軽量な"], base: ["ソード","ランス","アックス","ダガー","ロッド","ボウ"], attackMin: 3, attackMax: 5 },
  { rarity: "SR", rate: 20, prefix: ["迅速な", "魔導の", "精製された"], base: ["ソード","ランス","アックス","ダガー","ロッド","ボウ"], attackMin: 6, attackMax: 9, critMin: 0.5, critMax: 1.5 },
  { rarity: "UR", rate: 8,  prefix: ["王家の", "神聖な", "禁断の"], base: ["ソード","ランス","アックス","ダガー","ロッド","ボウ"], attackMin: 10, attackMax: 14, critMin: 1, critMax: 3, dropMin: 0.5, dropMax: 1.5 },
  { rarity: "LR", rate: 2,  prefix: ["伝説の", "竜殺しの", "英雄の"], base: ["ソード","ランス","アックス","ダガー","ロッド","ボウ"], attackMin: 15, attackMax: 20, critMin: 2, critMax: 4, addMin: 0.5, addMax: 1.5 },
];

// ================================
// ⚙️ 装備生成関数（統一・豪華表示対応）
// ================================
// ====== 修正版 genEquipment()（返すフィールドを正規化） ======
function genEquipment() {
  // レアリティ抽選
  const rand = Math.random() * 100;
  let sum = 0;
  let data = equipmentPool[0];
  for (const e of equipmentPool) {
    sum += e.rate;
    if (rand <= sum) {
      data = e;
      break;
    }
  }

  // 名前生成
  const prefix = data.prefix[Math.floor(Math.random() * data.prefix.length)];
  const base = data.base[Math.floor(Math.random() * data.base.length)];
  const name = `${prefix} ${base}（${data.rarity}）`;

  // ステータス生成（正規化したキー名で返す）
  const attack = Math.floor(Math.random() * (data.attackMax - data.attackMin + 1)) + data.attackMin;
  const critRate = data.critMin ? (Math.random() * (data.critMax - data.critMin) + data.critMin) : 0;
  const dropRate = data.dropMin ? (Math.random() * (data.dropMax - data.dropMin) + data.dropMin) : 0;
  const addAttackRate = data.addMin ? (Math.random() * (data.addMax - data.addMin) + data.addMin) : 0;

  return {
    name,
    rarity: data.rarity,
    rate: data.rate,
    attack,
    critRate,        // % 表示用（例: 1.2）
    dropRate,        // % 表示用（例: 0.8）
    addAttackRate    // % 表示用（例: 1.0）
  };
}

// ================================
// 🧮 スキル＋装備 合計ステータス計算（堅牢版）
// ================================
// ================================
// 📊 総合ステータス計算関数（経験値クリティカル修正版）
// ================================
function calcTotalStats(p) {
  let baseAtk = p.attack || 1;
  let equipAtk = 0;
  let equipCrit = 0;
  let equipAdd = 0;
  let equipDrop = 0;

  // 装備ステータス合計
  for (const e of p.equipment) {
    equipAtk += e.attack || 0;
    equipCrit += e.critRate || 0;
    equipAdd += e.addAttackRate || 0;
    equipDrop += e.dropRate || 0;
  }

  // スキル効果合計
  let skillAtk = 0;
  let skillExp = 0;
  let skillCrit = 0;
  let skillAdd = 0;
  let skillDrop = 0;
  let skillInstant = 0;
  let skillGrowth = 0;
  let skillExpCrit = 0; // 経験値クリティカル率

  for (const s of p.skills) {
    skillAtk += s.attack || 0;
    skillExp += s.expBonus || 0;
    skillCrit += s.critRate || 0;
    skillAdd += s.addAttackRate || 0;
    skillDrop += s.dropRate || 0;
    skillInstant += s.dragonKill || 0;
    skillGrowth += s.attackGrowth || 0;

    // 👇 「ひらめきの瞬間」専用処理を追加
    if (s.name === "ひらめきの瞬間") {
      skillExpCrit += 1; // +1%
    }
  }

  console.log("スキル経験値クリティカル合計:", skillExpCrit);

  return {
    baseAtk,
    equipAtk,
    skillAtk,
    atk: baseAtk + equipAtk + skillAtk,
    crit: equipCrit + skillCrit,
    add: equipAdd + skillAdd,
    drop: equipDrop + skillDrop,
    exp: skillExp,
    expCrit: skillExpCrit,
    instant: skillInstant,
    growth: skillGrowth
  };
}


// ───────────────
// ヘルパー：パーセンテージから「保証分」と「確率分」を分ける
// 戻り値：{ guaranteed: number, chancePct: number }
// ───────────────
function splitPercent(pct) {
  const guaranteed = Math.floor(pct / 100);
  const chancePct = pct % 100;
  return { guaranteed, chancePct };
}

// ───────────────
// クリティカル／経験値クリティカル用：仕様どおりの倍率計算
// 入力: pct (％の数値 例: 150, 50, 450)
// 戻り値: { multiplier: Number, guaranteed: Number, chancePct: Number, chanceRolled: boolean }
// - multiplier: 最終の倍率（例: 2,3,5,6...）
// - guaranteed: floor(pct/100) + 基本1 を作るために使う内部値は floor(pct/100)
// - chancePct: 残りのパーセンテージ（例: 50）
// - chanceRolled: 残りの確率判定で成功したか（表示用）
// 例: calcMultiplierFromPercent(150) -> { multiplier: 2 or 3, guaranteed:1, chancePct:50, chanceRolled: true/false }
// ───────────────
function calcMultiplierFromPercent(pct) {
  if (!pct || pct <= 0) {
    return { multiplier: 1, guaranteed: 0, chancePct: 0, chanceRolled: false, extra: 0 };
  }
  const { guaranteed, chancePct } = splitPercent(pct);
  const roll = Math.random() * 100;
  const chanceRolled = roll < chancePct;
  const extra = chanceRolled ? 1 : 0;
  const multiplier = 1 + guaranteed + extra;
  return { multiplier, guaranteed, chancePct, chanceRolled, extra };
}

// ───────────────
// 追加攻撃（攻撃回数）用：仕様どおり
// 入力: addPct (例: 5, 125, 250)
// 戻り値: { hits: Number, guaranteedExtra: Number, chancePct: Number, chanceRolled: boolean }
// - hits: 実際の攻撃回数（1以上）
// - guaranteedExtra: floor(addPct/100)（確定で増える回数）
// - chancePct, chanceRolled: 残りの確率とその判定結果（表示用）
// ───────────────
function calcAttackHitsFromPercent(addPct) {
  if (!addPct || addPct <= 0) return { hits: 1, guaranteedExtra: 0, chancePct: 0, chanceRolled: false };

  const { guaranteed, chancePct } = splitPercent(addPct);
  const roll = Math.random() * 100;
  const chanceRolled = roll < chancePct ? 1 : 0;
  const hits = 1 + guaranteed + chanceRolled;
  return { hits, guaranteedExtra: guaranteed, chancePct, chanceRolled: !!chanceRolled };
}

// ================================
// 🎮 メイン処理
// ================================
client.on("message", (channel, tags, message, self) => {
  if (self) return;
  const username = tags["display-name"];
  const cmd = message.trim();

    // ===============================
  // 💬 通常チャット入力の制限
  // ===============================
  // EventSub からの仮想実行（handleCommand）では tags が空オブジェクトになるので、
  // それを検出して除外しないようにする。
  const isFromChannelPoints = !tags["user-id"]; // ← チャンネルポイント実行時の仮想メッセージ判定

  // 通常チャットの場合は「！ステータス」以外を無視
  if (
    !isFromChannelPoints &&
    cmd !== "！ステータス" && cmd !== "!ステータス" &&
    cmd !== "！リセット" && cmd !== "!リセット"
  ) {
    return;
  }


// =========================
// 🟢 スライム
// =========================
if (cmd === "！スライム") {
  ensurePlayer(username);
  const p = playerData[username];
  const stats = calcTotalStats(p);

  // 🎲 0.5%でレアスライム出現（1/100）
  const isRareSlime = Math.random() < 0.1;

  let text = "";
  if (isRareSlime) {
  text += `\n💫💎💫💎💫💎💫💎💫💎💫\n`;
  text += `✨💎✨【超レア個体出現】✨💎✨\n`;
  text += `💎 ${username} の前に、メタリックなスライムがまばゆく光り輝いている！！ 💎\n`;
  text += `💫💎💫💎💫💎💫💎💫💎💫\n`;
} else {
  text += `🟢 ${username} はスライムを倒した！`;
}



  // --- 経験値計算 ---
  const baseExp = enemies["スライム"].exp * (isRareSlime ? 1000 : 1); // レア個体なら経験値1000倍
  let gained = baseExp + stats.exp;

  // 経験値クリティカル（仕様通りの多段倍率）
  const expCritCalc = calcMultiplierFromPercent(stats.expCrit);
  if (expCritCalc.multiplier > 1) {
    text += ` ✨ 経験値クリティカル発動！×${expCritCalc.multiplier}（+${expCritCalc.extra}）`;
    gained *= expCritCalc.multiplier;
  }

  // --- 経験値付与 ---
  p.exp += gained;
  const next = p.level * 10;
  const remaining = next - p.exp;
  text += ` 経験値＋${Math.floor(gained)}（次のLvまであと ${remaining > 0 ? remaining : 0} EXP）`;

  // --- レベルアップ ---
  const growth = p.skills.reduce((sum, s) => sum + (s.attackGrowth || 0), 0);
  let levelUps = 0;
  while (p.exp >= p.level * 10) {
    p.exp -= p.level * 10;
    p.level++;
    const gainAtk = 1 + growth;
    p.attack += gainAtk;
    levelUps++;
  }
  if (levelUps > 0) {
    const newStats = calcTotalStats(p);
    text += `🎉 Lvが${levelUps} 上がった！ → Lv${p.level}（攻撃＋${1 + growth}×${levelUps} → 合計攻撃力 ${newStats.atk}）`;
  }

 // --- 装備ドロップ ---
let dropChance;

if (isRareSlime) {
  dropChance = 1.0; // 💎 レアスライムは100％確定ドロップ
} else {
  dropChance = 0.10 + (stats.drop / 100); // 通常スライムは10％＋ドロップ補正
}

// 💎 スライムは SRまでしか出ないように制限
let slimeEquipPool = equipmentPool.filter(e =>
  ["N", "R", "SR"].includes(e.rarity)
);

// 🎲 レアスライムなら SR のみ出現
if (isRareSlime) {
  slimeEquipPool = slimeEquipPool.filter(e => e.rarity === "SR");
}

if (Math.random() < dropChance) {
  const rand = Math.random() * 100;
  let sum = 0;
  let data = slimeEquipPool[0];
  for (const e of slimeEquipPool) {
    sum += e.rate;
    if (rand <= sum) {
      data = e;
      break;
    }
  }

  const prefix = data.prefix[Math.floor(Math.random() * data.prefix.length)];
  const base = data.base[Math.floor(Math.random() * data.base.length)];
  const name = `${prefix} ${base}（${data.rarity}）`;

  const attack = Math.floor(Math.random() * (data.attackMax - data.attackMin + 1)) + data.attackMin;
  const critRate = data.critMin ? (Math.random() * (data.critMax - data.critMin) + data.critMin) : 0;

  const equip = {
    name,
    rarity: data.rarity,
    rate: data.rate,
    attack,
    critRate,
    dropRate: 0,
    addAttackRate: 0,
  };

  p.equipment.push(equip);

  const fancy =
    equip.rarity === "SR" ? "🌟 希少な装備を手に入れた！ 🌟" :
    equip.rarity === "R" ? "💠 良質な装備を発見！ 💠" : "";

  text += `\n${fancy}\n🎉 「${equip.name}」を手に入れた！\n` +
    `攻撃 +${equip.attack}` +
    (equip.critRate ? ` / クリティカル率 +${equip.critRate.toFixed(1)}%` : "") +
    `（排出率：${equip.rate}%）`;
}

// --- 💫 レア個体討伐ボーナス：スキル確定ドロップ ---
if (isRareSlime) {
  const totalRate = skillPool.reduce((a, b) => a + b.rate, 0);
  const rand = Math.random() * totalRate;
  let acc = 0;

  for (const s of skillPool) {
    acc += s.rate;
    if (rand <= acc) {
      p.skills.push(s);

      // レアリティアイコン
      const rarityIcon = {
        N: "⚪", R: "🔵", SR: "🟣", UR: "🟡",
        LR: "🌈", MR: "🔥", GR: "💎", EX: "👑"
      }[s.rarity] || "✨";

      // レアリティ演出
      const rarityEffect = {
        N: "🌱 初心者の一歩を刻んだ！",
        R: "💠 成長の兆しを感じる！",
        SR: "🌟 希少な力が宿った！",
        UR: "⚡ 伝説の力が脈動する！",
        LR: "🌈✨ 神話級スキルを覚醒！ ✨🌈",
        MR: "🔥💥 限界を超える力が解放された！！ 💥🔥",
        GR: "💎🌌 世界を揺るがす創世の力が降臨！！ 🌌💎",
        EX: "👑⚡⚡ 運命を支配する究極の力が覚醒！！！ ⚡⚡👑"
      }[s.rarity] || "";

      // ⭐ スキルガチャと同じ効果表示
      const effectText = s.effect;

      text += `\n${rarityIcon} 💫【レア討伐ボーナス】スキル「${s.name}（${s.rarity}）」を手に入れた！`;
      text += `\n${rarityEffect}`;
      text += `\n📘 効果：${effectText}`;

      break;
    }
  }
}


  client.say(channel, text);
  saveData();
  return;
}


// =========================
// ⚪ スケルトン
// =========================
if (cmd === "！スケルトン") {
  ensurePlayer(username);
  const p = playerData[username];
  const stats = calcTotalStats(p);

  // 🎲 1%でレアスケルトン出現（1/50）
  const isRareSkeleton = Math.random() < 0.1;

  let text = "";
  if (isRareSkeleton) {
  text += `\n💀🦴💥🦴💀🦴💥🦴💀🦴💥🦴💀\n`;
  text += `🔥💀【骨の王者、降臨】💀🔥\n`;
  text += `🦴 ${username} の前に、鋼の巨骨『骨太なスケルトン』が立ちはだかった！！ 🦴\n`;
  text += `💀🦴💥🦴💀🦴💥🦴💀🦴💥🦴💀\n`;
} else {
  text += `⚪ ${username} はスケルトンを倒した！`;
}



  // --- 経験値計算 ---
  const baseExp = enemies["スケルトン"].exp * (isRareSkeleton ? 1000 : 1); // レア個体なら経験値1000倍
  let gained = baseExp + stats.exp;

  // 経験値クリティカル処理
  const expCritCalc = calcMultiplierFromPercent(stats.expCrit);
  if (expCritCalc.multiplier > 1) {
    text += ` ✨ 経験値クリティカル発動！×${expCritCalc.multiplier}（+${expCritCalc.extra}）`;
    gained *= expCritCalc.multiplier;
  }

  // --- 経験値付与 ---
  p.exp += gained;
  const next = p.level * 10;
  const remaining = next - p.exp;
  text += ` 経験値＋${Math.floor(gained)}（次のLvまであと ${remaining > 0 ? remaining : 0} EXP）`;

  // --- レベルアップ ---
  const growth = p.skills.reduce((sum, s) => sum + (s.attackGrowth || 0), 0);
  let levelUps = 0;
  while (p.exp >= p.level * 10) {
    p.exp -= p.level * 10;
    p.level++;
    const gainAtk = 1 + growth;
    p.attack += gainAtk;
    levelUps++;
  }
  if (levelUps > 0) {
    const newStats = calcTotalStats(p);
    text += `🎉 Lvが${levelUps} 上がった！ → Lv${p.level}（攻撃＋${1 + growth}×${levelUps} → 合計攻撃力 ${newStats.atk}）`;
  }

  // --- 装備ドロップ ---
  let dropChance;

  if (isRareSkeleton) {
    dropChance = 1.0; // 💀 骨太スケルトンは100%確定ドロップ
  } else {
    dropChance = 0.25 + (stats.drop / 100); // 通常スケルトンは25% + 補正
  }

  // 💀 スケルトン装備プール定義
  let skeletonEquipPool;

  if (isRareSkeleton) {
    // 骨太スケルトン：LRのみ出現
    skeletonEquipPool = equipmentPool.filter(e => e.rarity === "LR");
  } else {
    // 通常スケルトン：N〜LR
    skeletonEquipPool = equipmentPool.filter(e =>
      ["N", "R", "SR", "UR", "LR"].includes(e.rarity)
    );
  }

  if (Math.random() < dropChance) {
    const data = skeletonEquipPool[Math.floor(Math.random() * skeletonEquipPool.length)];

    const prefix = data.prefix[Math.floor(Math.random() * data.prefix.length)];
    const base = data.base[Math.floor(Math.random() * data.base.length)];
    const name = `${prefix} ${base}（${data.rarity}）`;

    const attack = Math.floor(Math.random() * (data.attackMax - data.attackMin + 1)) + data.attackMin;
    const critRate = data.critMin ? (Math.random() * (data.critMax - data.critMin) + data.critMin) : 0;

    const equip = {
      name,
      rarity: data.rarity,
      rate: data.rate,
      attack,
      critRate,
      dropRate: 0,
      addAttackRate: 0,
    };

    p.equipment.push(equip);

    const fancy =
      equip.rarity === "LR" ? "🌈✨✨ 奇跡の装備を入手した！！ ✨✨🌈" :
      equip.rarity === "UR" ? "💫 伝説級の装備を発見！ 💫" :
      equip.rarity === "SR" ? "🌟 希少な装備を手に入れた！ 🌟" :
      equip.rarity === "R" ? "💠 良質な装備を発見！ 💠" : "";

    text += `\n${fancy}\n🎉 「${equip.name}」を手に入れた！\n` +
      `攻撃 +${equip.attack}` +
      (equip.critRate ? ` / クリティカル率 +${equip.critRate.toFixed(1)}%` : "") +
      `（排出率：${equip.rate}%）`;
  }

// --- 💀 レア個体討伐ボーナス：スキル確定ドロップ ---
if (isRareSkeleton) {
   const totalRate = skillPool.reduce((a, b) => a + b.rate, 0);
  const rand = Math.random() * totalRate;
  let acc = 0;

  for (const s of skillPool) {
    acc += s.rate;
    if (rand <= acc) {
      p.skills.push(s);

      // レアリティアイコン
      const rarityIcon = {
        N: "⚪", R: "🔵", SR: "🟣", UR: "🟡",
        LR: "🌈", MR: "🔥", GR: "💎", EX: "👑"
      }[s.rarity] || "✨";

      // レアリティ演出
      const rarityEffect = {
        N: "🌱 初心者の一歩を刻んだ！",
        R: "💠 成長の兆しを感じる！",
        SR: "🌟 希少な力が宿った！",
        UR: "⚡ 伝説の力が脈動する！",
        LR: "🌈✨ 神話級スキルを覚醒！ ✨🌈",
        MR: "🔥💥 限界を超える力が解放された！！ 💥🔥",
        GR: "💎🌌 世界を揺るがす創世の力が降臨！！ 🌌💎",
        EX: "👑⚡⚡ 運命を支配する究極の力が覚醒！！！ ⚡⚡👑"
      }[s.rarity] || "";

      // ⭐ スキルガチャと同じ効果表示
      const effectText = s.effect;

      text += `\n${rarityIcon} 💫【レア討伐ボーナス】スキル「${s.name}（${s.rarity}）」を手に入れた！`;
      text += `\n${rarityEffect}`;
      text += `\n📘 効果：${effectText}`;

      break;
    }
  }
}


  client.say(channel, text);
  saveData();
  return;
}


// =========================
// 🔥 ドラゴン戦
// =========================
if (cmd === "！ドラゴン") {
  ensurePlayer(username);
  const p = playerData[username];
  const stats = calcTotalStats(p);

  // ドラゴンの HP を初期化（プレイヤーごと）
  if (!p.dragonHP) {
    p.dragonHP = 100 + p.prestigeCount * 100; // プレステージごとにHP増加
  }

  let text = "";

  // 即死判定（EXスキル）
  const instantChance = stats.instant / 100;
  if (Math.random() < instantChance) {
    text += `👑 ${username} の「運命の断罪」が発動！ドラゴンは即死した！`;
    p.dragonHP = 0;
  } else {
    // --- 通常攻撃処理 ---
    const critCalc = calcMultiplierFromPercent(stats.crit);
    const hitsCalc = calcAttackHitsFromPercent(stats.add);
    const perHitDamage = Math.floor(stats.atk * critCalc.multiplier);
    const totalDamage = perHitDamage * hitsCalc.hits;

    p.dragonHP -= totalDamage;

    // --- 表示部分 ---
    text += `🔥 ${username} の攻撃！ ドラゴンに ${totalDamage} ダメージを与えた！`;
    if (critCalc.multiplier > 1) {
  text += ` 💥 クリティカル発動！×${critCalc.multiplier.toFixed(2)}（確定分 +${critCalc.guaranteed}、確率分 ${critCalc.chancePct.toFixed(1)}% → ${critCalc.chanceRolled ? "成功" : "失敗"}）`;
}
if (hitsCalc.hits > 1) {
  text += ` ⚡ 追加攻撃！×${hitsCalc.hits}回（確定 +${hitsCalc.guaranteedExtra}、確率分 ${hitsCalc.chancePct.toFixed(1)}% → ${hitsCalc.chanceRolled ? "成功" : "失敗"}）`;
}
    text += `（残りHP: ${Math.max(p.dragonHP, 0)}）`;
  }

  // --- ドラゴン撃破 ---
  if (p.dragonHP <= 0) {
    text += `\n🏆 ドラゴンを討伐した！プレステージ発動！`;

    // プレステージ処理（ステータスリセット、スキル保持）
    p.prestigeCount++;
    p.level = 1;
    p.exp = 0;
    p.attack = 1;
    p.equipment = [];
    p.dragonHP = 100 + p.prestigeCount * 100; // 次のドラゴンHP上昇

    // 🎉 豪華演出
    text += `\n🌈✨✨✨ ${username} は新たな力に覚醒した！ ✨✨✨🌈
🔁 レベル・攻撃力・装備はリセットされました。
💫 スキルは保持されたまま、さらに新たなスキルを1つ獲得！`;

    // 🎁 プレステージ報酬：スキル1つランダム入手
    const totalRate = skillPool.reduce((a, b) => a + b.rate, 0);
    const rand = Math.random() * totalRate;
    let acc = 0;
    for (const s of skillPool) {
      acc += s.rate;
      if (rand <= acc) {
        p.skills.push(s);

        const rarityEffects = {
          N: { icon: "⚪", banner: "🌱 平凡な力を得た……" },
          R: { icon: "🔵", banner: "💠 新たな力を思い出した！" },
          SR: { icon: "🟣", banner: "🌟 希少なスキルが光り輝く！" },
          UR: { icon: "🟡", banner: "💫 伝説級の力が解き放たれた！" },
          LR: { icon: "🟠", banner: "🌈✨✨ 奇跡のスキルが降臨！！ ✨✨🌈" },
          MR: { icon: "🔴", banner: "🔥🔥🔥 世界を揺るがす究極の力が覚醒！！ 🔥🔥🔥" },
          GR: { icon: "💎", banner: "💎💎💎 神話級スキルが降臨！！ 💎💎💎" },
          EX: { icon: "👑", banner: "⚡⚡⚡ 運命が震える…究極のスキルが覚醒！！ ⚡⚡⚡" },
        };

        const eff = rarityEffects[s.rarity] || {};
        const ratePercent = s.rate.toFixed(2).replace(/\.00$/, "");

        text += `\n${eff.banner}\n🎁 【新スキル獲得】${eff.icon} ${s.rarity}：${s.name}\n📘 効果：${s.effect}\n📊 排出率：${ratePercent}%`;
        break;
      }
    }
  }

  client.say(channel, text);
  saveData();
  return;
}

// ================================
// 🎁 スキルガチャ（演出付き豪華版）
// ================================
if (cmd === "！スキルガチャ") {
  ensurePlayer(username);
  const p = playerData[username];

  // 抽選処理
  const totalRate = skillPool.reduce((a, b) => a + b.rate, 0);
  const rand = Math.random() * totalRate;
  let acc = 0;
  let skill;
  for (const s of skillPool) {
    acc += s.rate;
    if (rand <= acc) {
      skill = s;
      break;
    }
  }
  if (!skill) return;

  // スキル追加
  p.skills.push(skill);
  saveData();


  // レアリティごとの演出設定
  const rarityEffects = {
    N: { icon: "⚪", flair: "・", shout: "小さな力を得た！" },
    R: { icon: "🔵", flair: "・", shout: "少し強くなった！" },
    SR: { icon: "🟣", flair: "✨", shout: "力が輝きを放つ！" },
    UR: { icon: "🟡", flair: "🌟", shout: "英雄級の力が覚醒！" },
    LR: { icon: "🟠", flair: "🌈", shout: "伝説が蘇る！" },
    MR: { icon: "🔴", flair: "🔥", shout: "限界を超えた！" },
    GR: { icon: "💎", flair: "💫💫💫", shout: "創世の奇跡が起きた！" },
    EX: { icon: "👑", flair: "⚡⚡⚡", shout: "運命を超越した！！" },
  };

  const eff = rarityEffects[skill.rarity] || {};

  // Twitchチャット用に1行ずつ構築（改行あり）
  const msg =
    `${eff.flair}【スキルガチャ結果】${eff.flair}\n` +
    `${eff.icon} レアリティ：${skill.rarity}（${skill.rate}%）\n` +
    `💫 スキル名：${skill.name}\n` +
    `📘 効果：${skill.effect}\n` +
    `🎉 ${username} は${eff.shout}`;

  client.say(channel, msg);
  return;
}

// =========================
// 📊 ステータス表示（装備効果＋スキル完全反映）
// =========================

// 🌟 全角「！」→半角「!」変換
const normalizedCmd = cmd.replace("！", "!");

if (normalizedCmd === "!ステータス") {
  ensurePlayer(username);
  const p = playerData[username];
  const stats = calcTotalStats(p);
  const neededExp = p.level * 10 - p.exp;

  // スキル数サマリー（レアリティ順に整列）
  const rarityOrder = ["N", "R", "SR", "UR", "LR", "MR", "GR", "EX"];
  const skillCounts = {};
  for (const s of p.skills) {
    skillCounts[s.rarity] = (skillCounts[s.rarity] || 0) + 1;
  }
  const skillSummary = rarityOrder
    .filter(r => skillCounts[r])
    .map(r => `${r}×${skillCounts[r]}`)
    .join(" / ") || "なし";

  const dragonHP = p.dragonHP;

  // ステータス出力構築
  let lines = [];
  lines.push(`📊 【 ${username} のステータス】`);
  lines.push(`Lv: ${p.level} / Exp: ${p.exp}（次のLvまであと ${neededExp}） / Prestige: ${p.prestigeCount}`);
  lines.push(`🗡️ 総合攻撃力：${stats.atk}（基礎 ${stats.baseAtk} + 装備 ${stats.equipAtk} + スキル ${stats.skillAtk}）`);

  if (stats.crit > 0) lines.push(`🎯 クリティカル率：${stats.crit.toFixed(1)}%`);
  if (stats.add > 0) lines.push(`⚡ 攻撃追加率：${stats.add.toFixed(1)}%`);
  if (stats.exp > 0) lines.push(`📘 経験値ボーナス：+${stats.exp}`);
  if (stats.expCrit > 0) lines.push(`✨ 経験値クリティカル：+${stats.expCrit}%`);
  if (stats.drop > 0) lines.push(`💎 装備ドロップ率：+${stats.drop.toFixed(1)}%`);
  if (stats.instant > 0) lines.push(`☠️ 即死率（ドラゴン専用）：${stats.instant.toFixed(1)}%`);
  if (stats.growth > 0) lines.push(`📈 Lvアップ時 攻撃上昇補正：+${stats.growth}`);

  lines.push(`――――――――`);
  lines.push(`🪓 装備数：${p.equipment.length}個`);
  lines.push(`――――――――`);
  lines.push(`スキル獲得数：${skillSummary}`);
  lines.push(`ドラゴン残HP:${dragonHP}`);

  client.say(channel, lines.join("\n"));
  return;
}




  // =========================
  // 🧹 リセット
  // =========================
 // if (cmd === "！リセット") {
 //   delete playerData[username];
 //   saveData();
 //   client.say(channel, `🧹 ${username} のデータをリセットしました。`);
 //   return;
 // }
});

