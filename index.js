// index.js (ESM)
// package.json に "type": "module" を�Eれてください
import tmi from "tmi.js";
import fs from "fs";
import { ApiClient } from "@twurple/api";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import dotenv from "dotenv";
dotenv.config();

// ---------------------------
// 環墁E��数
// ---------------------------
const CHANNEL = process.env.CHANNEL;
const BOT_NAME = process.env.BOT_NAME;
const OAUTH_TOKEN = process.env.OAUTH_TOKEN;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_ACCESS_TOKEN = process.env.TWITCH_ACCESS_TOKEN; // user token (scoped)
const TWITCH_REFRESH_TOKEN = process.env.TWITCH_REFRESH_TOKEN;
const TWITCH_BROADCASTER_ID = process.env.TWITCH_BROADCASTER_ID; // 数字�E斁E���E

const SLIME_REWARD_ID = process.env.SLIME_REWARD_ID;
const SKELETON_REWARD_ID = process.env.SKELETON_REWARD_ID;
const DRAGON_REWARD_ID = process.env.DRAGON_REWARD_ID;
const SKILL_GACHA_REWARD_ID = process.env.SKILL_GACHA_REWARD_ID;
const LOGIN_GACHA_REWARD_ID = process.env.LOGIN_GACHA_REWARD_ID;


if (!CHANNEL || !BOT_NAME || !OAUTH_TOKEN) {
  console.error("忁E���E環墁E��数 (CHANNEL, BOT_NAME, OAUTH_TOKEN) が設定されてぁE��せん、E.env を確認してください、E);
  process.exit(1);
}

// ---------------------------
// tmi.js: チャチE��接綁E
// ---------------------------
const client = new tmi.Client({
  options: { debug: true },
  connection: { reconnect: true },
  identity: {
    username: BOT_NAME,
    password: OAUTH_TOKEN,
  },
  channels: [CHANNEL],
});

client.connect().catch(err => {
  console.error("tmi client connect error:", err);
});

// ---------------------------
// プレイヤーチE�Eタ読み書ぁE
// ---------------------------
const SAVE_FILE = "./players.json";
let playerData = {};
if (fs.existsSync(SAVE_FILE)) {
  try {
    playerData = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
  } catch (e) {
    console.error("players.json の読み込みに失敗しました:", e);
    playerData = {};
  }
}

function saveData() {
  try {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(playerData, null, 2), "utf8");
  } catch (e) {
    console.error("保存に失敁E", e);
  }
}



// ---------------------------
// クールタイム管琁E
// ---------------------------
const cooldowns = {
  slime: {},      // { username: timestamp }
  skeleton: {}
};

function checkCooldown(username, monsterType) {
  const now = Date.now();
  const cooldownSeconds = monsterType === 'slime' ? 120 : 300;
  const cooldownMs = cooldownSeconds * 1000;
  
  if (!cooldowns[monsterType][username]) {
    return { ready: true };
  }
  
  const lastUsed = cooldowns[monsterType][username];
  const elapsed = now - lastUsed;
  
  if (elapsed >= cooldownMs) {
    return { ready: true };
  }
  
  const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
  return { ready: false, remaining };
}

function setCooldown(username, monsterType) {
  cooldowns[monsterType][username] = Date.now();
}



// ---------------------------
// スキル�E�裁E��プ�Eル�E��E仕様！E
// ---------------------------
const skillPool = [
  { rarity: "N", name: "斬撁E�E忁E��E, effect: "攻撁E��E", attack: 1, rate: 21.0 },
  { rarity: "N", name: "学びの初歩", effect: "経験値ボ�Eナス�E�E", expBonus: 1, rate: 21.0 },
  { rarity: "R", name: "戦士の記�E", effect: "攻撁E��E", attack: 2, rate: 17.5 },
  { rarity: "R", name: "熟練の知恵", effect: "経験値ボ�Eナス�E�E", expBonus: 2, rate: 17.5 },
  { rarity: "SR", name: "閁E�Eの一撁E, effect: "クリチE��カル玁E��E%", critRate: 1, rate: 7.5 },
  { rarity: "SR", name: "ひらめき�E瞬閁E, effect: "経験値クリチE��カル�E�E%", expCrit: 1, rate: 7.5 },
  { rarity: "UR", name: "英雁E�E魁E, effect: "攻撁E��E0", attack: 10, rate: 1.5 },
  { rarity: "UR", name: "知恵の結晶", effect: "経験値ボ�Eナス�E�E0", expBonus: 10, rate: 1.5 },
  { rarity: "UR", name: "勁E��E�E勁E, effect: "クリチE��カル玁E��E%", critRate: 3, rate: 1.5 },
  { rarity: "UR", name: "武神�E閁E�E", effect: "攻撁E��加玁E��E%", addAttackRate: 1, rate: 1.5 },
  { rarity: "LR", name: "幸運�E加護", effect: "裁E��ドロチE�E玁E��E%", dropRate: 1, rate: 1.2 },
  { rarity: "MR", name: "限界突破", effect: "LvアチE�E時攻撁E���E値�E�E", attackGrowth: 1, rate: 0.5 },
  { rarity: "GR", name: "創世�E劁E, effect: "攻撁E��E00", attack: 100, rate: 0.0267 },
  { rarity: "GR", name: "時�E叡智", effect: "経験値ボ�Eナス�E�E00", expBonus: 100, rate: 0.0267 },
  { rarity: "GR", name: "神速�E閁E�E", effect: "攻撁E��加玁E��E0%", addAttackRate: 10, rate: 0.0267 },
  { rarity: "EX", name: "運命の断罪", effect: "ドラゴン即死玁E��E%", dragonKill: 1, rate: 0.02 },
];

const equipmentPool = [
  { rarity: "N", rate: 40, prefix: ["古びぁE, "鉁E�E", "錁E�EぁE], base: ["ソーチE,"ランス","アチE��ス","ダガー","ロチE��","ボウ"], attackMin: 1, attackMax: 2 },
  { rarity: "R", rate: 30, prefix: ["鋭ぁE, "頑丈な", "軽量な"], base: ["ソーチE,"ランス","アチE��ス","ダガー","ロチE��","ボウ"], attackMin: 3, attackMax: 5 },
  { rarity: "SR", rate: 20, prefix: ["迁E��な", "魔導�E", "精製されぁE], base: ["ソーチE,"ランス","アチE��ス","ダガー","ロチE��","ボウ"], attackMin: 6, attackMax: 9, critMin: 0.5, critMax: 1.5 },
  { rarity: "UR", rate: 8, prefix: ["王家の", "神聖な", "禁断の"], base: ["ソーチE,"ランス","アチE��ス","ダガー","ロチE��","ボウ"], attackMin: 10, attackMax: 14, critMin: 1, critMax: 3, dropMin: 0.5, dropMax: 1.5 },
  { rarity: "LR", rate: 2, prefix: ["伝説の", "竜殺し�E", "英雁E�E"], base: ["ソーチE,"ランス","アチE��ス","ダガー","ロチE��","ボウ"], attackMin: 15, attackMax: 20, critMin: 2, critMax: 4, addMin: 0.5, addMax: 1.5 },
];

function genEquipmentFromPool(pool) {
  const rand = Math.random() * 100;
  let sum = 0;
  let data = pool[0];
  for (const e of pool) {
    sum += e.rate;
    if (rand <= sum) { data = e; break; }
  }
  const prefix = data.prefix[Math.floor(Math.random() * data.prefix.length)];
  const base = data.base[Math.floor(Math.random() * data.base.length)];
  const name = `${prefix} ${base}�E�E{data.rarity}�E�`;
  const attack = Math.floor(Math.random() * (data.attackMax - data.attackMin + 1)) + data.attackMin;
  const critRate = data.critMin ? (Math.random() * (data.critMax - data.critMin) + data.critMin) : 0;
  const dropRate = data.dropMin ? (Math.random() * (data.dropMax - data.dropMin) + data.dropMin) : 0;
  const addAttackRate = data.addMin ? (Math.random() * (data.addMax - data.addMin) + data.addMin) : 0;
  return { name, rarity: data.rarity, rate: data.rate, attack, critRate, dropRate, addAttackRate };
}





// レア度ごとの演�EチE��イン�E�レア表記をシンプル化！E
const rarityStyles = {
  "N": {
    icon: "⚪",
    title: "【N、E,
    fx: "✨",
    flavor: "小さな一歩。しかし確かな前進だ、E,
  },
  "R": {
    icon: "🟦",
    title: "【R、E,
    fx: "💠💠",
    flavor: "力�E気�Eが、ほん�Eりと漂う…�E�E,
  },
  "SR": {
    icon: "🟪",
    title: "【SR、E,
    fx: "🌟🌟🌟",
    flavor: "腕に走る閃光…これは只老E��はなぁE��E,
  },
  "UR": {
    icon: "🟨",
    title: "【UR、E,
    fx: "🔥✨🔥✨🔥",
    flavor: "周囲の空気が霁E��る…強老E�E力が宿る！E,
  },
  "LR": {
    icon: "🟧",
    title: "【LR、E,
    fx: "🌈🔥🌈🔥🌈",
    flavor: "伝説の名に恥じぬ輝きが�EぁE��りる�E�E,
  },
  "MR": {
    icon: "🟥",
    title: "【MR、E,
    fx: "💥🌈💥🌈💥",
    flavor: "神話級�E波動が溢れ�Eす…�E�E,
  },
  "GR": {
    icon: "🌌",
    title: "【GR、E,
    fx: "🌌🌌🌟🌈🌟🌌🌌",
    flavor: "宁E���E琁E��ら歪める…創世�E力が目覚める！E,
  },
  "EX": {
    icon: "👑",
    title: "【EX、E,
    fx: "💥👑⚡🌈⚡🔥🌈⚡👑💥",
    flavor: "世界が静止する…運命が書き換わる瞬間だチE��E��E,
  }
};



// ---------------------------
// スチE�Eタス計算（�E仕様！E
// ---------------------------
function calcTotalStats(p) {
  const baseAtk = p.attack || 1;
  let equipAtk = 0, equipCrit = 0, equipAdd = 0, equipDrop = 0;
  if (p.equipment && Array.isArray(p.equipment)) {
    for (const e of p.equipment) {
      equipAtk += e.attack || 0;
      equipCrit += e.critRate || 0;
      equipAdd += e.addAttackRate || 0;
      equipDrop += e.dropRate || 0;
    }
  }
  let skillAtk = 0, skillExp = 0, skillCrit = 0, skillAdd = 0, skillDrop = 0, skillInstant = 0, skillGrowth = 0, skillExpCrit = 0;
  if (p.skills && Array.isArray(p.skills)) {
    for (const s of p.skills) {
      skillAtk += s.attack || 0;
      skillExp += s.expBonus || 0;
      skillCrit += s.critRate || 0;
      skillAdd += s.addAttackRate || 0;
      skillDrop += s.dropRate || 0;
      skillInstant += s.dragonKill || 0;
      skillGrowth += s.attackGrowth || 0;
      if (s.name === "ひらめき�E瞬閁E || s.expCrit) skillExpCrit += (s.expCrit || 1);
    }
  }

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
    growth: skillGrowth,
  };
}

// ---------------------------
// 敵設定（�E仕様！E
// ---------------------------
const enemies = {
  "スライム": { exp: 5 },
  "スケルトン": { exp: 15 },
  "ドラゴン": { exp: 0 },
};

// ---------------------------
// ヘルパ�E�E��Eレイヤー初期化等！E
// ---------------------------
function ensurePlayer(username) {
  if (!playerData[username]) {
    playerData[username] = {
      level: 1,
      exp: 0,
      attack: 1,
      equipment: [],
      skills: [],
      prestigeCount: 0,
      dragonHP: 100,
      cooldowns: { slime: 0, skeleton: 0 },
      maxAttack: 1,
      maxDamage: 0  // ☁E��加: 最大ダメージ
    };
    saveData();
    client.say(`#${CHANNEL}`, `🌍 ${username} の冒険が始まった！`);
  }
  // ☁E��存�Eレイヤーにも追加
  if (!playerData[username].cooldowns) {
    playerData[username].cooldowns = { slime: 0, skeleton: 0 };
  }
  if (playerData[username].maxAttack === undefined) {
    playerData[username].maxAttack = playerData[username].attack || 1;
  }
  if (playerData[username].maxDamage === undefined) {
    playerData[username].maxDamage = 0;
  }
}


function handleCommand(username, cmd, bonusText = null) {
  // 仮想皁E�� chat イベントを発火
  // bonusTextがあれ�E tags に埋め込む
  const tags = { "display-name": username };
  if (bonusText) tags["bonus-text"] = bonusText;
  
  client.emit("message", `#${CHANNEL}`, tags, cmd, false);
}

// ==========================
// 🔐 ト�Eクン自動更新 AuthProvider
// ==========================
import { RefreshingAuthProvider } from "@twurple/auth";

async function createAuthProvider() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const accessToken = process.env.TWITCH_ACCESS_TOKEN;
  const refreshToken = process.env.TWITCH_REFRESH_TOKEN;
  const broadcasterId = process.env.TWITCH_BROADCASTER_ID;

  console.log('🔍 認証惁E��チェチE��:');
  console.log('Client ID:', clientId ? '✁E : '❁E);
  console.log('Client Secret:', clientSecret ? '✁E : '❁E);
  console.log('Access Token:', accessToken ? `✁E(${accessToken.substring(0, 10)}...)` : '❁E);
  console.log('Refresh Token:', refreshToken ? '✁E : '❁E);
  console.log('Broadcaster ID:', broadcasterId);

  if (!clientId || !clientSecret || !accessToken) {
    console.error("❁E忁E���E認証惁E��が不足してぁE��ぁE);
    process.exit(1);
  }

  const authProvider = new RefreshingAuthProvider(
    {
      clientId,
      clientSecret,
      onRefresh: async (userId, newTokenData) => {
        console.log(`🔄 ト�Eクン更新: User ${userId}`);
        
        // .envファイルを更新
        const envContent = [
          `TWITCH_CLIENT_ID=${clientId}`,
          `TWITCH_CLIENT_SECRET=${clientSecret}`,
          `TWITCH_ACCESS_TOKEN=${newTokenData.accessToken}`,
          `TWITCH_REFRESH_TOKEN=${newTokenData.refreshToken}`,
          `TWITCH_BROADCASTER_ID=${broadcasterId}`,
          `CHANNEL=${process.env.CHANNEL}`,
          `BOT_NAME=${process.env.BOT_NAME}`,
          `OAUTH_TOKEN=${process.env.OAUTH_TOKEN}`,
          `SLIME_REWARD_ID=${process.env.SLIME_REWARD_ID}`,
          `SKELETON_REWARD_ID=${process.env.SKELETON_REWARD_ID}`,
          `DRAGON_REWARD_ID=${process.env.DRAGON_REWARD_ID}`,
          `SKILL_GACHA_REWARD_ID=${process.env.SKILL_GACHA_REWARD_ID}`,
          `LOGIN_GACHA_REWARD_ID=${process.env.LOGIN_GACHA_REWARD_ID}`,
        ].join('\n');

        fs.writeFileSync('.env', envContent, 'utf8');
        console.log('✁E.envファイルを更新しました');
      }
    }
  );

  // ☁E��要E ト�Eクンを�E示皁E��追加
  await authProvider.addUser(
    broadcasterId,
    {
      accessToken,
      refreshToken,
      expiresIn: 0,
      obtainmentTimestamp: 0
    },
   
  );

  console.log('✁EAuthProvider初期化完亁E);
  return authProvider;
}


// ===========================
// 🎁 ログインガチャ�E�チャンネルポイント！E
// ===========================


// ---------------------------
// EventSub(WebSocket) 初期化（チャンネルポイント監視！E
// ---------------------------
async function setupEventSub() {
  const authProvider = await createAuthProvider();
  const apiClient = new ApiClient({ authProvider });


 try {
    const tokenInfo = await authProvider.getAccessTokenForUser(TWITCH_BROADCASTER_ID);
    console.log('🔍 AuthProviderが使用するト�Eクン:', tokenInfo.accessToken.substring(0, 15) + '...');
    
    // 実際にAPIリクエストしてスコープを確誁E
    const validateResponse = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { 'Authorization': `OAuth ${tokenInfo.accessToken}` }
    });
    const validateData = await validateResponse.json();
    console.log('🔍 実際のスコーチE', validateData.scopes);
  } catch (error) {
    console.error('❁Eト�Eクン取得エラー:', error);
  }


  // ☁ETwurple v7 正しい書き方
  const listener = new EventSubWsListener({ apiClient });

  await listener.start();
  console.log("EventSub listener started with auto-refresh token.");

  listener.onChannelRedemptionAdd(TWITCH_BROADCASTER_ID, (event) => {
  try {
    // ☁EserDisplayName を使用�E�表示名！E
    const user = event.userDisplayName || event.userName || "anonymous";
    const rewardId = event.rewardId || "";
    const rewardTitle = event.rewardTitle || "";

    console.log(`🎁 ${user} が報酬、E{rewardTitle}」を使用しました`);

    if (rewardId === SLIME_REWARD_ID) {
      handleCommand(user, "�E�スライム");

    } else if (rewardId === SKELETON_REWARD_ID) {
      handleCommand(user, "�E�スケルトン");

    } else if (rewardId === DRAGON_REWARD_ID) {
      handleCommand(user, "�E�ドラゴン");

    } else if (rewardId === SKILL_GACHA_REWARD_ID) {
      handleCommand(user, "�E�スキルガチャ");

    } else if (rewardId === LOGIN_GACHA_REWARD_ID) {
      ensurePlayer(user);
      const p = playerData[user];

      const total = skillPool.reduce((a, b) => a + b.rate, 0);
      let r = Math.random() * total;
      let acc = 0;
      let picked = null;

      for (const s of skillPool) {
        acc += s.rate;
        if (r <= acc) { picked = s; break; }
      }
      if (!picked) return;

      p.skills.push(picked);
      saveData();

      const st = rarityStyles[picked.rarity] || rarityStyles["N"];

      const msg =
        `\n${st.fx}\n` +
        `🎁 ${user} のログインガチャ�E�E🎁\n` +
        `${st.fx}\n\n` +
        `🔸 ${st.title}\n` +
        `${st.icon} 、E{picked.name}』\n` +
        `💬 効果！E{picked.effect}\n` +
        `📊 排�E玁E��E{picked.rate}%\n\n` +
        `✴ ${st.flavor}`;

      client.say(`#${CHANNEL}`, msg);
    }

  } catch (e) {
    console.error("EventSub error:", e);
  }
});
}




// ---------------------------
// tmi メチE��ージ処琁E���E仕様準拠のコマンド！E
// ---------------------------
client.on("message", (channel, tags = {}, message = "", self) => {
  if (self) return;
  const username = tags["display-name"] || "anonymous";
  const cmd = message.trim();

  // EventSub の仮想実行！EandleCommand�E�でめEtags["user-id"] がなぁE��合があるので、E
  // そ�E場合�E許可する�E�チャンネルポイント由来�E�、E
  const isFromChannelPoints = !tags["user-id"];

  // 通常チャチE��はスチE�Eタスだけ開放する�E��E仕様と合わせる�E�E
  if (!isFromChannelPoints && cmd !== "�E�スチE�Eタス" && cmd !== "!スチE�Eタス" && cmd !== "�E�リセチE��" && cmd !== "!リセチE��") {
    return;
  }

// スライム討企E
if (cmd === "�E�スライム") {
  ensurePlayer(username);

// ☁E��ールタイムチェチE��
  const cooldownCheck = checkCooldown(username, 'slime');
  if (!cooldownCheck.ready) {
    client.say(channel, `⏰ ${username} ちめE��と征E��てね�E�あと ${cooldownCheck.remaining} 秒`);
    return;
  }
  
  // ☁E��ールタイム設宁E
  setCooldown(username, 'slime');


  const p = playerData[username];
  const stats = calcTotalStats(p);

  let lines = [];

  // ☁Eレアスライム判定！E% ↁE1%に変更�E�E
  const isRare = Math.random() < 0.01;

  if (isRare) {
    // ☁E�E☁Eレアスライム処琁E☁E�E☁E
  lines.push(
    `🌟💎🌟💎🌟💎🌟💎🌟💎🌟💎🌟\n` +
    `✨ 眩ぁE�Eが溢れ�EぁE..伝説のモンスターだ�E�E✨\n` +
    `🌈✨🌟✨🌈✨🌟✨🌈\n` +
    `💎、EメタリチE��なスライム 降�E�E�】💎\n` +
    `🌈✨🌟✨🌈✨🌟✨🌈\n` +
    `🌟💎🌟💎🌟💎🌟💎🌟💎🌟💎🌟\n` +
    `${username} は銀色に輝く神秘�Eスライムを撃破した�E�`
  );

    // 経験値�E�通常5 ÁE1000 = 5000�E�E
  const baseExp = 5000;
    const bonusExp = stats.exp || 0;
    let gained = baseExp + bonusExp;

    // 経験値クリチE��カル
let expCrit = stats.expCrit || 0;
let mult = 1 + Math.floor(expCrit / 100);
const fractional = expCrit % 100;
let critText = "";

if (Math.random() * 100 < fractional) mult++;
if (mult > 1) critText = `�E�経験値クリチE��カル ÁE{mult}　経験値クリ玁E ${expCrit.toFixed(1)}%�E�`;


    const finalExp = Math.floor(gained * mult);
    p.exp += finalExp;

    lines.push(
      `📥 獲得経験値�E�E{finalExp} �E�基礁E${baseExp} + ボ�Eナス ${bonusExp}�E�E{critText}`
    );

    // レベルアチE�E処琁E���E通！E
    let levelUps = 0;
    const growth = p.skills.reduce((s, sk) => s + (sk.attackGrowth || 0), 0);
    let beforeLevel = p.level;
    let beforeStats = calcTotalStats(p);
    let beforeTotalAtk = beforeStats.atk;
    let totalAtkGain = 0;

    while (p.exp >= p.level * 10) {
      p.exp -= p.level * 10;
      p.level++;
      const atkGain = 1 + growth;
      p.attack += atkGain;
      totalAtkGain += atkGain;
      levelUps++;
    }

    if (levelUps > 0) {
  const afterStats = calcTotalStats(p);
  const afterTotalAtk = afterStats.atk;

  lines.push(
    `📈 Lv${beforeLevel} ↁELv${p.level}�E�E${levelUps}�E�\n` +
    `　基礎攻撁E+${totalAtkGain}\n` +
    `　総合攻撁E���E�E{beforeTotalAtk} ↁE${afterTotalAtk}`
  );

  // ☁E��高攻撁E��を更新
  if (afterTotalAtk > p.maxAttack) {
    p.maxAttack = afterTotalAtk;
  }
}

    const nextExp = p.level * 10 - p.exp;
    lines.push(`📘 次のレベルまで�E�あと ${nextExp} Exp`);

    // ☁ESR確定ドロチE�E�E�レアスライム専用 / 100%�E�E
{
  // SRプ�Eルのみ抽出
  const pool = equipmentPool.filter(e => e.rarity === "SR");

  const eq = genEquipmentFromPool(pool);
  p.equipment.push(eq);

  const rarityRate = pool
    .filter(x => x.rarity === eq.rarity)
    .reduce((a, b) => a + b.rate, 0);

  let detail = [];
  detail.push(`攻撁E+${eq.attack}`);
  if (eq.critRate) detail.push(`クリ玁E+${eq.critRate.toFixed(1)}%`);
  if (eq.dropRate) detail.push(`ドロチE�E玁E+${eq.dropRate.toFixed(1)}%`);
  if (eq.addAttackRate) detail.push(`追加攻撁E+${eq.addAttackRate.toFixed(1)}%`);

  lines.push(
    `🎁 【確定ドロチE�E】！E{eq.rarity} 排�E玁E��E{rarityRate.toFixed(3)}%�E�\n` +
    `🎉 、E{eq.name}」を手に入れた�E�\n` +
    `✨ ${detail.join(" / ")}`
  );
}

// ☁E�E☁Eスキルガチャ�E�メチE��ージに追加�E��E☁E�E
  {
    const total = skillPool.reduce((a, b) => a + b.rate, 0);
    let r = Math.random() * total;
    let acc = 0;
    let picked = null;

    for (const s of skillPool) {
      acc += s.rate;
      if (r <= acc) { picked = s; break; }
    }

    if (picked) {
      p.skills.push(picked);
      const st = rarityStyles[picked.rarity] || rarityStyles["N"];

      lines.push(
        `\n${st.fx}\n` +
        `🎁 レアスライム討伐�Eーナス�E�E🎁\n` +
        `${st.fx}\n` +
        `🔸 ${st.title}\n` +
        `${st.icon} 、E{picked.name}』\n` +
        `💬 効果！E{picked.effect}\n` +
        `📊 排�E玁E��E{picked.rate}%\n` +
        `✴ ${st.flavor}`
      );
    }
  }

  saveData();

// ☁E��高攻撁E��チェチE��
const updatedStats = calcTotalStats(p);
if (updatedStats.atk > p.maxAttack) {
  p.maxAttack = updatedStats.atk;
}

  client.say(channel, lines.join("\n"));
  return;
}
  // ☁E�E☁E通常スライム�E�今まで通り�E�E☁E�E☁E

  lines.push(`🟢 ${username} はスライムを倒した！`);

  const baseExp = enemies["スライム"].exp;
  const bonusExp = stats.exp || 0;
  let gained = baseExp + bonusExp;

  // 経験値クリチE��カル
let expCrit = stats.expCrit || 0;
let mult = 1 + Math.floor(expCrit / 100);
const fractional = expCrit % 100;
let critText = "";

if (Math.random() * 100 < fractional) mult++;
if (mult > 1) critText = `�E�経験値クリチE��カル ÁE{mult}　経験値クリ玁E ${expCrit.toFixed(1)}%�E�`;

  const finalExp = Math.floor(gained * mult);
  p.exp += finalExp;

  lines.push(
    `📥 獲得経験値�E�E{finalExp} �E�基礁E${baseExp} + ボ�Eナス ${bonusExp}�E�E{critText}`
  );

  // --- レベルアチE�E共送E---
  let levelUps = 0;
  const growth = p.skills.reduce((s, sk) => s + (sk.attackGrowth || 0), 0);

  let beforeLevel = p.level;
  let beforeStats = calcTotalStats(p);
  let beforeTotalAtk = beforeStats.atk;

  let totalAtkGain = 0;

  while (p.exp >= p.level * 10) {
    p.exp -= p.level * 10;
    p.level++;

    const atkGain = 1 + growth;
    p.attack += atkGain;
    totalAtkGain += atkGain;

    levelUps++;
  }

  if (levelUps > 0) {
  const afterStats = calcTotalStats(p);
  const afterTotalAtk = afterStats.atk;

  lines.push(
    `📈 Lv${beforeLevel} ↁELv${p.level}�E�E${levelUps}�E�\n` +
    `　基礎攻撁E+${totalAtkGain}\n` +
    `　総合攻撁E���E�E{beforeTotalAtk} ↁE${afterTotalAtk}`
  );

  // ☁E��高攻撁E��を更新
  if (afterTotalAtk > p.maxAttack) {
    p.maxAttack = afterTotalAtk;
  }
}

  const nextExp = p.level * 10 - p.exp;
  lines.push(`📘 次のレベルまで�E�あと ${nextExp} Exp`);

  // 裁E��ドロチE�E�E�既存�E処琁E��E
  const dropChance = 0.10 + (stats.drop / 100);
  if (Math.random() < dropChance) {
    const pool = equipmentPool.filter(e => ["N", "R", "SR"].includes(e.rarity));
    const eq = genEquipmentFromPool(pool);
    p.equipment.push(eq);

    const rarityRate = pool.filter(x => x.rarity === eq.rarity).reduce((a, b) => a + b.rate, 0);

    let detail = [];
    detail.push(`攻撁E+${eq.attack}`);
    if (eq.critRate) detail.push(`クリ玁E+${eq.critRate.toFixed(1)}%`);
    if (eq.dropRate) detail.push(`ドロチE�E玁E+${eq.dropRate.toFixed(1)}%`);
    if (eq.addAttackRate) detail.push(`追加攻撁E+${eq.addAttackRate.toFixed(1)}%`);

    lines.push(
      `🎁 裁E��ドロチE�E�E�E��E{eq.rarity} 排�E玁E��E{rarityRate.toFixed(3)}%�E�\n` +
      `🎉 、E{eq.name}」を手に入れた�E�\n` +
      `✨ ${detail.join(" / ")}`
    );
  }

  saveData();

// ☁E��高攻撁E��チェチE��
const updatedStats = calcTotalStats(p);
if (updatedStats.atk > p.maxAttack) {
  p.maxAttack = updatedStats.atk;
}

  client.say(channel, lines.join("\n"));
  return;
}




// スケルトン討企E
if (cmd === "�E�スケルトン") {
  ensurePlayer(username);

// ☁E��ールタイムチェチE��
  const cooldownCheck = checkCooldown(username, 'skeleton');
  if (!cooldownCheck.ready) {
    client.say(channel, `⏰ ${username} ちめE��と征E��てね�E�あと ${cooldownCheck.remaining} 秒`);
    return;
  }
  
  // ☁E��ールタイム設宁E
  setCooldown(username, 'skeleton');


  const p = playerData[username];
  const stats = calcTotalStats(p);

  let lines = [];

  // ☁Eレアスケルトン判定！E% ↁE2%に変更�E�E
  const isRare = Math.random() < 0.02;

  if (isRare) {
    // ☁E�E☁Eレアスケルトン処琁E☁E�E☁E
  lines.push(
    `⚔️💀⚔️💀⚔️💀⚔️💀⚔️💀⚔️💀⚔️\n` +
    `🔥 大地が震える...冥界�E番人が現れた�E�E🔥\n` +
    `⚡💀👑💀⚡💀👑💀⚡\n` +
    `👑、E骨太なスケルトン 襲来�E�】👑\n` +
    `⚡💀👑💀⚡💀👑💀⚡\n` +
    `⚔️💀⚔️💀⚔️💀⚔️💀⚔️💀⚔️💀⚔️\n` +
    `${username} は漁E���E鎧を纏う骸骨王を撁E��した�E�`
  );

    // レアスケルトン経験値�E�通常15 ÁE1000 = 15000�E�E
  const baseExp = 15000;
    const bonusExp = stats.exp || 0;
    let gained = baseExp + bonusExp;

   // 経験値クリチE��カル
let expCrit = stats.expCrit || 0;
let mult = 1 + Math.floor(expCrit / 100);
const fractional = expCrit % 100;
let critText = "";

if (Math.random() * 100 < fractional) mult++;
if (mult > 1) critText = `�E�経験値クリチE��カル ÁE{mult}　経験値クリ玁E ${expCrit.toFixed(1)}%�E�`;

    const finalExp = Math.floor(gained * mult);
    p.exp += finalExp;

    lines.push(
      `📥 獲得経験値�E�E{finalExp} �E�基礁E${baseExp} + ボ�Eナス ${bonusExp}�E�E{critText}`
    );

    // --- レベルアチE�E共送E---
    let levelUps = 0;
    const growth = p.skills.reduce((s, sk) => s + (sk.attackGrowth || 0), 0);

    let beforeLevel = p.level;
    let beforeStats = calcTotalStats(p);
    let beforeTotalAtk = beforeStats.atk;
    let totalAtkGain = 0;

    while (p.exp >= p.level * 10) {
      p.exp -= p.level * 10;
      p.level++;

      const atkGain = 1 + growth;
      p.attack += atkGain;
      totalAtkGain += atkGain;

      levelUps++;
    }

    if (levelUps > 0) {
  const afterStats = calcTotalStats(p);
  const afterTotalAtk = afterStats.atk;

  lines.push(
    `📈 Lv${beforeLevel} ↁELv${p.level}�E�E${levelUps}�E�\n` +
    `　基礎攻撁E+${totalAtkGain}\n` +
    `　総合攻撁E���E�E{beforeTotalAtk} ↁE${afterTotalAtk}`
  );

  // ☁E��高攻撁E��を更新
  if (afterTotalAtk > p.maxAttack) {
    p.maxAttack = afterTotalAtk;
  }
}

    const nextExp = p.level * 10 - p.exp;
    lines.push(`📘 次のレベルまで�E�あと ${nextExp} Exp`);

    // ☁ELR確定ドロチE�E�E�レアスケルトン専用 / 100%�E�E
{
  const pool = equipmentPool.filter(e => e.rarity === "LR");

  const eq = genEquipmentFromPool(pool);
  p.equipment.push(eq);

  const rarityRate = pool
    .filter(x => x.rarity === eq.rarity)
    .reduce((a, b) => a + b.rate, 0);

  let detail = [];
  detail.push(`攻撁E+${eq.attack}`);
  if (eq.critRate) detail.push(`クリ玁E+${eq.critRate.toFixed(1)}%`);
  if (eq.dropRate) detail.push(`ドロチE�E玁E+${eq.dropRate.toFixed(1)}%`);
  if (eq.addAttackRate) detail.push(`追加攻撁E+${eq.addAttackRate.toFixed(1)}%`);

  lines.push(
    `🎁 【確定ドロチE�E】！E{eq.rarity} 排�E玁E��E{rarityRate.toFixed(3)}%�E�\n` +
    `🎉 、E{eq.name}」を手に入れた�E�\n` +
    `✨ ${detail.join(" / ")}`
  );
}

// ☁E�E☁Eスキルガチャ�E�メチE��ージに追加�E��E☁E�E
  {
    const total = skillPool.reduce((a, b) => a + b.rate, 0);
    let r = Math.random() * total;
    let acc = 0;
    let picked = null;

    for (const s of skillPool) {
      acc += s.rate;
      if (r <= acc) { picked = s; break; }
    }

    if (picked) {
      p.skills.push(picked);
      const st = rarityStyles[picked.rarity] || rarityStyles["N"];

      lines.push(
        `\n${st.fx}\n` +
        `🎁 レアスケルトン討伐�Eーナス�E�E🎁\n` +
        `${st.fx}\n` +
        `🔸 ${st.title}\n` +
        `${st.icon} 、E{picked.name}』\n` +
        `💬 効果！E{picked.effect}\n` +
        `📊 排�E玁E��E{picked.rate}%\n` +
        `✴ ${st.flavor}`
      );
    }
  }

  saveData();

// ☁E��高攻撁E��チェチE��
const updatedStats = calcTotalStats(p);
if (updatedStats.atk > p.maxAttack) {
  p.maxAttack = updatedStats.atk;
}

  client.say(channel, lines.join("\n"));
  return;
  }

  // ☁E�E☁E通常スケルトン�E�ここから下�E允E�E処琁E��E☁E�E☁E
  lines.push(`⚪ ${username} はスケルトンを倒した！`);

  const baseExp = enemies["スケルトン"].exp;
  const bonusExp = stats.exp || 0;
  let gained = baseExp + bonusExp;

 // 経験値クリチE��カル
let expCrit = stats.expCrit || 0;
let mult = 1 + Math.floor(expCrit / 100);
const fractional = expCrit % 100;
let critText = "";

if (Math.random() * 100 < fractional) mult++;
if (mult > 1) critText = `�E�経験値クリチE��カル ÁE{mult}　経験値クリ玁E ${expCrit.toFixed(1)}%�E�`;

  const finalExp = Math.floor(gained * mult);
  p.exp += finalExp;

  lines.push(
    `📥 獲得経験値�E�E{finalExp} �E�基礁E${baseExp} + ボ�Eナス ${bonusExp}�E�E{critText}`
  );

  // --- レベルアチE�E ---
  let levelUps = 0;
  const growth = p.skills.reduce((s, sk) => s + (sk.attackGrowth || 0), 0);

  let beforeLevel = p.level;
  let beforeStats = calcTotalStats(p);
  let beforeTotalAtk = beforeStats.atk;

  let totalAtkGain = 0;

  while (p.exp >= p.level * 10) {
    p.exp -= p.level * 10;
    p.level++;

    const atkGain = 1 + growth;
    p.attack += atkGain;
    totalAtkGain += atkGain;

    levelUps++;
  }

  if (levelUps > 0) {
  const afterStats = calcTotalStats(p);
  const afterTotalAtk = afterStats.atk;

  lines.push(
    `📈 Lv${beforeLevel} ↁELv${p.level}�E�E${levelUps}�E�\n` +
    `　基礎攻撁E+${totalAtkGain}\n` +
    `　総合攻撁E���E�E{beforeTotalAtk} ↁE${afterTotalAtk}`
  );

  // ☁E��高攻撁E��を更新
  if (afterTotalAtk > p.maxAttack) {
    p.maxAttack = afterTotalAtk;
  }
}

  const nextExp = p.level * 10 - p.exp;
  lines.push(`📘 次のレベルまで�E�あと ${nextExp} Exp`);

  const dropChance = 0.25 + (stats.drop / 100);
  if (Math.random() < dropChance) {
    const pool = equipmentPool.filter(e =>
      ["N", "R", "SR", "UR", "LR"].includes(e.rarity)
    );
    const eq = genEquipmentFromPool(pool);
    p.equipment.push(eq);

    const rarityRate = pool
      .filter(x => x.rarity === eq.rarity)
      .reduce((a, b) => a + b.rate, 0);

    let detail = [];
    detail.push(`攻撁E+${eq.attack}`);

    if (eq.critRate && eq.critRate > 0)
      detail.push(`クリ玁E+${eq.critRate.toFixed(1)}%`);
    if (eq.dropRate && eq.dropRate > 0)
      detail.push(`ドロチE�E玁E+${eq.dropRate.toFixed(1)}%`);
    if (eq.addAttackRate && eq.addAttackRate > 0)
      detail.push(`追加攻撁E+${eq.addAttackRate.toFixed(1)}%`);

    lines.push(
      `🎁 裁E��ドロチE�E�E�E��E{eq.rarity} 排�E玁E��E{rarityRate.toFixed(3)}%�E�\n` +
      `🎉 、E{eq.name}」を手に入れた�E�\n` +
      `✨ ${detail.join(" / ")}`
    );
  }

  saveData();

// ☁E��高攻撁E��チェチE��
const updatedStats = calcTotalStats(p);
if (updatedStats.atk > p.maxAttack) {
  p.maxAttack = updatedStats.atk;
}

  client.say(channel, lines.join("\n"));
  return;
}




// クリチE��カル倍率�E�あなた仕様！E
function getCritMultiplier(crit) {
  const baseStage = Math.floor(crit / 100); 
  const remainder = crit % 100;

  let mult = 1 + baseStage;

  if (Math.random() * 100 < remainder) {
    mult += 1;
  }
  return mult;
}

if (cmd === "�E�ドラゴン") {
  ensurePlayer(username);
  const p = playerData[username];
  const stats = calcTotalStats(p);
  if (!p.dragonHP) p.dragonHP = 100 + (p.prestigeCount || 0) * 100;

  let lines = [];

  // ☁Eドラゴンに挑んだことを�E確に表示
  lines.push(`🔥 ${username} はドラゴンに挑んだ�E�`);

  // 即死判定（運命の断罪�E�E
  const instantChance = (stats.instant || 0) / 100;
  if (Math.random() < instantChance) {
    lines.push(`👑 ${username} の「運命の断罪」が発動！Eドラゴンは即死した�E�E��即死玁E ${stats.instant.toFixed(1)}%�E�`);
    p.dragonHP = 0;

  } else {

  const atk = stats.atk;

  // 追加攻撁EↁEヒット数
  const add = stats.add || 0;
  let hits = 1 + Math.floor(add / 100);
  const addRemain = add % 100;
  if (Math.random() * 100 < addRemain) hits++;

  // ☁E��リチE��カル倍率めE回だけ判定（�Eヒット�E通！E
  const critMul = getCritMultiplier(stats.crit || 0);

  let totalDamage = 0;

  // 全ヒットに同じ倍率を適用
  for (let h = 0; h < hits; h++) {
    let dmg = Math.floor(atk * critMul);
    totalDamage += dmg;
  }

  // ☁E��大ダメージ更新
  if (totalDamage > (p.maxDamage || 0)) {
    p.maxDamage = totalDamage;
  }

  const remain = Math.max(p.dragonHP - totalDamage, 0);

  // ☁E先に攻撁E��グ
  lines.push(
    `🔥 ${username} の攻撁E��E${hits} ヒットで合訁E${totalDamage} ダメージ�E�残HP: ${remain}�E�`
  );

  // ☁E追加攻撁E��示�E�ヒチE��数ぁE以上�E場合！E
  if (hits > 1) {
    lines.push(`⚡ 追加攻撁E��生！E��追加玁E ${stats.add.toFixed(1)}%�E�`);
  }

  // ☁EクリチE��カル表示�E�倍率で表示�E�E
  if (critMul > 1) {
    lines.push(`✨ クリチE��カル ÁE{critMul} 倍！E��クリ玁E ${stats.crit.toFixed(1)}%�E�`);
  }

  p.dragonHP -= totalDamage;
}

  // -------------------------
  // 討企EↁEプレスチE�Eジ
  // -------------------------
  if (p.dragonHP <= 0) {
    lines.push(`🏆 ドラゴンを討伐した！�EレスチE�Eジ発動！`);

    // ==== スキルガチャ ====
    const total = skillPool.reduce((a, b) => a + b.rate, 0);
    let r = Math.random() * total;
    let acc = 0;
    let rewardSkill = null;

    for (const s of skillPool) {
      acc += s.rate;
      if (r <= acc) {
        rewardSkill = s;
        p.skills.push(s);
        break;
      }
    }

    if (rewardSkill) {
      const st = rarityStyles[rewardSkill.rarity] || rarityStyles["N"];

      lines.push(
        `\n${st.fx}\n` +
        `🎁 ${username} のプレスチE�Eジ報酬�E�E🎁\n` +
        `${st.fx}\n\n` +
        `🔸 ${st.title}\n` +
        `${st.icon} 、E{rewardSkill.name}』\n` +
        `💬 効果！E{rewardSkill.effect}\n` +
        `📊 排�E玁E��E{rewardSkill.rate}%\n\n` +
        `✴ ${st.flavor}`
      );
    }

    // ☁EプレスチE�Eジの説昁E
    lines.push(
      `💫 プレスチE�Eジにより、レベル・攻撁E��・裁E��はリセチE��され、スキルのみ引き継がれます、En` +
      `　　次回�Eドラゴン最大HPぁE+100 されます。`
    );

    // ---- プレスチE�Eジ処琁E----
    p.prestigeCount = (p.prestigeCount || 0) + 1;
    p.level = 1;
    p.exp = 0;
    p.attack = 1;
    p.equipment = [];
    p.dragonHP = 100 + p.prestigeCount * 100;
  }

  saveData();

  // ☁E��高攻撁E��チェチE��
  const updatedStats = calcTotalStats(p);
  if (updatedStats.atk > p.maxAttack) {
    p.maxAttack = updatedStats.atk;
  }

  client.say(channel, lines.join("\n"));
  return;
}


// =========================
//   スキルガチャ�E�任意！E
// =========================
if (cmd === "�E�スキルガチャ") {
  ensurePlayer(username);
  const p = playerData[username];

  // ☁E�EーナスチE��ストを取征E
  const bonusText = tags["bonus-text"] || null;

  // スキル抽選
  const total = skillPool.reduce((a,b) => a + b.rate, 0);
  let r = Math.random() * total, acc = 0, picked = null;

  for (const s of skillPool) {
    acc += s.rate;
    if (r <= acc) { picked = s; break; }
  }

  if (picked) {
    const st = rarityStyles[picked.rarity] || rarityStyles["N"];
    p.skills.push(picked);
    saveData();

// ☁E��高攻撁E��チェチE��
const updatedStats = calcTotalStats(p);
if (updatedStats.atk > p.maxAttack) {
  p.maxAttack = updatedStats.atk;
}

    // ☁E��イトル部刁E��動的に変更
    const title = bonusText ? `🎁 ${bonusText}�E�E🎁` : `🎲 ${username} のスキルガチャ�E�E🎲`;

    // ⭁E統一演�E
    client.say(channel,
      `\n${st.fx}\n` +
      `${title}\n` +
      `${st.fx}\n\n` +
      `🔸 ${st.title}\n` +
      `${st.icon} 、E{picked.name}』\n` +
      `💬 効果！E{picked.effect}\n` +
      `📊 排�E玁E��E{picked.rate}%\n\n` +
      `✴ ${st.flavor}`
    );
  }
  return;
}



  // スチE�Eタス表示�E��E仕様！E
if (cmd === "�E�スチE�Eタス" || cmd === "!スチE�Eタス") {
  ensurePlayer(username);
  const p = playerData[username];
  const stats = calcTotalStats(p);
  const neededExp = p.level * 10 - p.exp;
  const counts = {};
  if (Array.isArray(p.skills)) for (const s of p.skills) counts[s.rarity] = (counts[s.rarity]||0) + 1;
  const summary = ["N","R","SR","UR","LR","MR","GR","EX"].filter(r => counts[r]).map(r => `${r}ÁE{counts[r]}`).join(" / ") || "なぁE;
  const lines = [
    `📊 、E${username} のスチE�Eタス】`,
    `Lv: ${p.level} / Exp: ${p.exp}�E�次のLvまであと ${neededExp}�E�E/ Prestige: ${p.prestigeCount||0}`,
    `🗡�E�E総合攻撁E���E�E{stats.atk}�E�基礁E${stats.baseAtk} + 裁E�� ${stats.equipAtk} + スキル ${stats.skillAtk}�E�`,
  ];
  if (stats.growth > 0) lines.push(`⬁E��ELvアチE�E時攻撁E���E値�E�E${stats.growth}`);  // ☁E��加
  if (stats.crit > 0) lines.push(`🎯 クリチE��カル玁E��E{stats.crit.toFixed(1)}%`);
  if (stats.add > 0) lines.push(`⚡ 攻撁E��加玁E��E{stats.add.toFixed(1)}%`);
  if (stats.exp > 0) lines.push(`📘 経験値ボ�Eナス�E�E${stats.exp}`);
  if (stats.expCrit > 0) lines.push(`✨ 経験値クリチE��カル�E�E${stats.expCrit}%`);
  if (stats.drop > 0) lines.push(`💎 裁E��ドロチE�E玁E��E${stats.drop.toFixed(1)}%`);
  if (stats.instant > 0) lines.push(`☠�E�E即死玁E��ドラゴン専用�E�！E{stats.instant.toFixed(1)}%`);
  lines.push(`――――――――`);
  lines.push(`🪁E裁E��数�E�E{(p.equipment||[]).length}個`);
  lines.push(`――――――――`);
  lines.push(`スキル獲得数�E�E{summary}`);
  lines.push(`ドラゴン残HP: ${p.dragonHP || 0}`);
  client.say(channel, lines.join("\n"));
  return;
}

 // リセチE���E�任意に有効化！E
if (cmd === "�E�リセチE��" || cmd === "!リセチE��") {
  // ☁E�E信老E��用チェチE��
  if (username !== "komugi5656") {
    client.say(channel, `❁E${username} こ�Eコマンド�E配信老E��用です。`);
    return;
  }
  
  delete playerData[username];
  saveData();
  client.say(channel, `🧹 ${username} のチE�EタをリセチE��しました。`);
  return;
}
});








// 起勁E
(async () => {
  try {
    await setupEventSub();
    console.log("Bot ready.");
  } catch (e) {
    console.error("初期化中にエラー:", e);
  }
})();


// ==========================
// 🔄 ランキング自動更新�E�E刁E��と�E�E
// ==========================
import { execSync } from 'child_process';
import crypto from 'crypto';

let lastHash = '';

setInterval(() => {
  try {
    const currentData = fs.readFileSync('./players.json', 'utf8');
    const currentHash = crypto.createHash('md5').update(currentData).digest('hex');
    
    if (currentHash !== lastHash) {
      console.log('🔄 プレイヤーチE�Eタが更新されました。ランキングを更新しまぁE..');
      
      // ランキング生�E
      execSync('node ranking-generator.js', { stdio: 'inherit' });
      
      // ☁E�Eレイヤー詳細も生戁E
      execSync('node process_players.js', { stdio: 'inherit' });
      
      // Gitプッシュ
      execSync('git add docs/ranking.json docs/players_detail.json players.json', { cwd: process.cwd() });
      execSync('git commit -m "Auto update rankings, player details, and players data"', { cwd: process.cwd() });
      execSync('git push', { cwd: process.cwd() });
      
      lastHash = currentHash;
      console.log('✁Eランキング�E�E�Eレイヤー詳細の自動更新完亁E);
    }
  } catch (error) {
    console.log('⚠�E�Eランキング更新スキチE�E:', error.message);
  }
}, 5 * 60 * 1000); // ☁E刁E��と

console.log('🔄 ランキング自動更新を開始しました�E�E刁E��隔！E); // ☁E��チE��ージも変更
