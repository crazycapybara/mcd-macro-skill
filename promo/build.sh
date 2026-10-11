#!/bin/bash
# 宣传片一键生成（纯画面 + 文字引导 + 配乐音效，无旁白）
#   bash promo/build.sh          完整生成（需要本地服务 localhost:8787 在跑，用于截取真实页面）
#   bash promo/build.sh mix      只重新混音 + 编码（帧和音频已存在时）
# 输出：media/麦克罗宣传片.mp4（竖屏 1080×1920，30 秒）
set -euo pipefail
cd "$(dirname "$0")"
B=build
if [ "${1:-}" != "mix" ]; then
  node capture.mjs     # 官方商品图 + 真实页面截图
  node render.mjs      # 逐帧渲染 promo.html
  python3 audio.py     # 合成配乐和音效（无外部素材）
fi
mkdir -p ../media
ffmpeg -v error -y -framerate 30 -i $B/frames/f%04d.jpg -i $B/music.wav -i $B/sfx.wav -filter_complex "
  [1:a]volume=0.8[mus];[2:a]volume=0.6[fx];
  [mus][fx]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9,afade=t=out:st=29.2:d=0.8,atrim=0:30[aout]" \
  -map 0:v -map "[aout]" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -ar 44100 -shortest ../media/麦克罗宣传片.mp4
echo "✅ 输出：$(cd .. && pwd)/media/麦克罗宣传片.mp4"
