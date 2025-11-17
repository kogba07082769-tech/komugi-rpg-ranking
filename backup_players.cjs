const fs = require('fs');
const path = require('path');

// バックアップディレクトリを作成
const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}

// タイムスタンプ付きでバックアップ
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `players-${timestamp}.json`);

fs.copyFileSync('players.json', backupFile);
console.log(`✅ Backup created: ${backupFile}`);

// 古いバックアップを削除（3日以上前のものを削除）
const files = fs.readdirSync(backupDir);
const now = Date.now();
const sevenDaysAgo = now - (3 * 24 * 60 * 60 * 1000);

files.forEach(file => {
  const filePath = path.join(backupDir, file);
  const stats = fs.statSync(filePath);
  if (stats.mtimeMs < sevenDaysAgo) {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Deleted old backup: ${file}`);
  }
});

