import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('players.json を読み込んでいます...');

// players.json を読み込む
const playersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'players.json'), 'utf8'));

// 加工後のデータ
const processedData = {};

console.log('データを加工しています...');

// 各プレイヤーのデータを加工
for (const [playerName, playerInfo] of Object.entries(playersData)) {
  // 装備をグループ化してカウント
  const equipmentMap = new Map();
  if (playerInfo.equipment && Array.isArray(playerInfo.equipment)) {
    playerInfo.equipment.forEach(item => {
      const key = item.name;
      if (equipmentMap.has(key)) {
        equipmentMap.get(key).count++;
      } else {
        equipmentMap.set(key, { ...item, count: 1 });
      }
    });
  }

  // スキルをグループ化してカウント
  const skillsMap = new Map();
  if (playerInfo.skills && Array.isArray(playerInfo.skills)) {
    playerInfo.skills.forEach(item => {
      const key = item.name;
      if (skillsMap.has(key)) {
        skillsMap.get(key).count++;
      } else {
        skillsMap.set(key, { ...item, count: 1 });
      }
    });
  }

  processedData[playerName] = {
    level: playerInfo.level || 0,
    exp: playerInfo.exp || 0,
    attack: playerInfo.attack || 0,
    prestigeCount: playerInfo.prestigeCount || 0,
    dragonHP: playerInfo.dragonHP || 0,
    equipment: Array.from(equipmentMap.values()),
    skills: Array.from(skillsMap.values())
  };
}

// 最終更新日時を追加
const outputData = {
  lastUpdate: new Date().toISOString(),
  players: processedData
};

// docs/players_detail.json に出力
const outputPath = path.join(__dirname, 'docs', 'players_detail.json');
fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

const originalSize = fs.statSync(path.join(__dirname, 'players.json')).size;
const processedSize = fs.statSync(outputPath).size;
const reduction = ((1 - processedSize / originalSize) * 100).toFixed(2);

console.log('✅ 完了しました！');
console.log(`  元のサイズ: ${(originalSize / 1024).toFixed(2)} KB`);
console.log(`  加工後のサイズ: ${(processedSize / 1024).toFixed(2)} KB`);
console.log(`  削減率: ${reduction}%`);
console.log(`  出力先: ${outputPath}`);
