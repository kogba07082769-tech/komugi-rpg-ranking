// verify-token.js
// 現在のトークンのスコープを確認

import dotenv from 'dotenv';
dotenv.config();

const token = process.env.TWITCH_ACCESS_TOKEN;

if (!token) {
  console.error('❌ TWITCH_ACCESS_TOKENが設定されていません');
  process.exit(1);
}

console.log('🔍 トークン検証中...\n');
console.log(`トークン: ${token.substring(0, 15)}...`);

try {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { 'Authorization': `OAuth ${token}` }
  });
  
  if (!response.ok) {
    console.error(`❌ HTTPエラー: ${response.status}`);
    const text = await response.text();
    console.error(text);
    process.exit(1);
  }

  const data = await response.json();
  
  console.log('✅ トークンは有効です\n');
  console.log('📋 トークン情報:');
  console.log(`  Client ID: ${data.client_id}`);
  console.log(`  User ID: ${data.user_id}`);
  console.log(`  Login: ${data.login}`);
  console.log(`  有効期限: ${data.expires_in ? `${Math.floor(data.expires_in / 3600)}時間後` : '不明'}`);
  
  console.log('\n🔐 スコープ一覧:');
  if (data.scopes && data.scopes.length > 0) {
    data.scopes.forEach(scope => {
      console.log(`  - ${scope}`);
    });
  } else {
    console.log('  ⚠️  スコープがありません');
  }
  
  console.log('\n🎯 必要なスコープチェック:');
  const hasReadRedemptions = data.scopes?.includes('channel:read:redemptions');
  const hasManageRedemptions = data.scopes?.includes('channel:manage:redemptions');
  
  console.log(`  channel:read:redemptions: ${hasReadRedemptions ? '✅ あり' : '❌ なし'}`);
  console.log(`  channel:manage:redemptions: ${hasManageRedemptions ? '✅ あり' : '❌ なし'}`);
  
  if (!hasReadRedemptions || !hasManageRedemptions) {
    console.log('\n❌ 必要なスコープが不足しています！');
    console.log('トークンを取り直す必要があります。');
  } else {
    console.log('\n🎉 すべて揃っています！');
    console.log('別の問題がある可能性があります。');
  }
  
} catch (error) {
  console.error('❌ エラー:', error.message);
}