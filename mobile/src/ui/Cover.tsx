/**
 * 图片 + 无封面/加载失败降级的方块。
 *
 * 全库 2675 条里 157 条没有 image（hsr/gacha 65 张全无、zzz/enemies 63 张无）。
 * 之前这些条目在首页/列表/收藏里渲染成一块纯色灰方块，跟「图加载失败」
 * 长得一模一样。这里换成分类文字占位，加载失败也走同一条降级。
 * 占位文字在 src/lib/placeholder.js（纯函数，node --test 能跑）。
 */
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getApp } from '../api/app';
import { placeholderLabel } from '../lib/placeholder';

const PLACEHOLDER_COLOR = '#241f3a';

export function CoverPlaceholder({
  category,
  style,
}: {
  category?: string | null;
  style?: any;
}) {
  return (
    <View style={[styles.box, style]}>
      <Text numberOfLines={1} style={styles.label}>{placeholderLabel(category)}</Text>
    </View>
  );
}

export function CoverImage({
  path,
  category,
  style,
  resizeMode = 'cover',
}: {
  path?: string | null;
  category?: string | null;
  style?: any;
  resizeMode?: 'cover' | 'contain';
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (!path) { setUri(null); return () => { alive = false; }; }
    getApp()
      .then(({ client }) => { if (alive) setUri(client.imageUrl(path)); })
      .catch(() => { if (alive) setUri(null); });
    return () => { alive = false; };
  }, [path]);

  if (!uri || failed) return <CoverPlaceholder category={category} style={style} />;
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', backgroundColor: PLACEHOLDER_COLOR },
  label: { color: '#6f6890', fontSize: 11, fontWeight: '700' },
});
