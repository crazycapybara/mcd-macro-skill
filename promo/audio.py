# 宣传片配乐 + 音效：纯 Python 标准库现场合成（无外部素材，无版权问题）
import math, random, struct, wave, sys, os

SR = 44100
DUR = 30.0
N = int(SR * DUR)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build')
random.seed(42)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

def add(buf, start, samples, gain=1.0):
    i0 = int(start * SR)
    for i, v in enumerate(samples):
        j = i0 + i
        if 0 <= j < N: buf[j] += v * gain
        elif j >= N: break

def env(n, attack=0.004, decay=0.25):
    a = max(1, int(attack * SR))
    return [ (i / a) if i < a else math.exp(-(i - a) / (decay * SR)) for i in range(n) ]

def bell(freq, dur=0.32, decay=0.22):
    n = int(dur * SR); e = env(n, 0.002, decay)
    return [e[i] * (math.sin(2 * math.pi * freq * i / SR) + 0.35 * math.sin(2 * math.pi * freq * 2.76 * i / SR) * math.exp(-i / (0.05 * SR))) for i in range(n)]

def pluck(freq, dur=0.22, decay=0.12):
    n = int(dur * SR); e = env(n, 0.003, decay)
    out = []
    for i in range(n):
        ph = (freq * i / SR) % 1.0
        tri = 4 * abs(ph - 0.5) - 1
        out.append(e[i] * tri)
    return out

def kick():
    n = int(0.22 * SR); out = []; ph = 0
    for i in range(n):
        f = 45 + 110 * math.exp(-i / (0.03 * SR)); ph += 2 * math.pi * f / SR
        out.append(math.sin(ph) * math.exp(-i / (0.09 * SR)))
    return out

def noise(dur, decay, hp=False):
    n = int(dur * SR); prev = 0; out = []
    for i in range(n):
        r = random.uniform(-1, 1); v = (r - prev) if hp else r; prev = r
        out.append(v * math.exp(-i / (decay * SR)))
    return out

# ---------------- 配乐 ----------------
music = [0.0] * N
BPM = 120; beat = 60 / BPM; bar = beat * 4
chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C G Am F
roots = [48, 43, 45, 41]
KICK, CLAP, HAT = kick(), noise(0.14, 0.035), noise(0.05, 0.012, hp=True)
nbars = int(DUR / bar) + 1
for b in range(nbars):
    t0 = b * bar
    if t0 >= DUR: break
    ch, rt = chords[b % 4], roots[b % 4]
    drop = 12.5 <= t0 < 28  # 品牌登场后更饱满
    for k in range(4):  # 鼓
        tb = t0 + k * beat
        if k in (0, 2): add(music, tb, KICK, 0.55)
        if k in (1, 3) and t0 >= 1.9: add(music, tb, CLAP, 0.16)
        add(music, tb + beat / 2, HAT, 0.10)
    for k in range(8):  # 贝斯：八分音符跳跃
        note = rt + (12 if k % 4 == 2 else 0)
        add(music, t0 + k * beat / 2, pluck(midi(note), 0.24, 0.10), 0.20)
    arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[2] + 12]
    for k in range(16 if drop else 8):  # 铃铛琶音
        step = beat / 4 if drop else beat / 2
        add(music, t0 + k * step, bell(midi(arp[k % 8]), 0.3, 0.16), 0.075)
    if b % 2 == 0:  # 可爱的小旋律：每两小节一句
        motif = [ch[2] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24]
        for k, m in enumerate(motif):
            add(music, t0 + k * beat * 0.75 + beat * 2, bell(midi(m + 12), 0.45, 0.25), 0.05)
# 结尾和弦
for m in [60, 64, 67, 72]:
    add(music, 28.0, bell(midi(m + 12), 2.0, 0.9), 0.08)
# 淡出最后 1.2 秒
for i in range(int(28.8 * SR), N): music[i] *= max(0, (N - i) / (1.2 * SR))

# ---------------- 音效 ----------------
sfx = [0.0] * N
def pop(t, f=700, g=0.5):
    n = int(0.09 * SR); out = []; ph = 0
    for i in range(n):
        ff = f * (1 + 1.2 * i / n); ph += 2 * math.pi * ff / SR
        out.append(math.sin(ph) * math.exp(-i / (0.025 * SR)))
    add(sfx, t, out, g)
def tick(t, g=0.18): add(sfx, t, bell(2600, 0.04, 0.008), g)
def ding(t, f=1568, g=0.35): add(sfx, t, bell(f, 0.8, 0.35), g)
def thud(t, g=0.9):
    add(sfx, t, kick(), g); add(sfx, t, noise(0.12, 0.03), 0.25)
def whoosh(t, dur=0.35, g=0.25):
    n = int(dur * SR); out = []; prev = 0
    for i in range(n):
        x = i / n; a = math.sin(math.pi * x); r = random.uniform(-1, 1); prev = prev * (0.6 + 0.35 * x) + r * 0.4
        out.append(prev * a)
    add(sfx, t, out, g)
def boing(t, g=0.4):
    n = int(0.35 * SR); out = []; ph = 0
    for i in range(n):
        f = 180 + 120 * math.sin(i / SR * 40) * math.exp(-i / (0.12 * SR)); ph += 2 * math.pi * f / SR
        out.append(math.sin(ph) * math.exp(-i / (0.12 * SR)))
    add(sfx, t, out, g)
def chime(t, g=0.28):
    for k, m in enumerate([72, 76, 79, 84]): add(sfx, t + k * 0.07, bell(midi(m), 0.7, 0.3), g)
def rattle(t0, t1, g=0.06):
    t = t0
    while t < t1: add(sfx, t, noise(0.03, 0.008, hp=True), g); t += 0.055

# S1
pop(0.15); boing(0.75, 0.35); pop(1.1, 820); pop(1.55, 600); pop(2.0, 950, 0.35)
# S2
pop(3.4, 650); [tick(3.7 + k * 0.06) for k in range(17)]; ding(4.72, 1760, 0.25)
pop(4.85, 520); pop(5.15, 560); pop(5.45, 880); whoosh(6.05); pop(5.85, 1200, 0.25)
# S3
pop(7.75, 760); whoosh(8.05, 0.3, 0.2); whoosh(8.25, 0.3, 0.2); rattle(9.5, 10.9)
for k in range(10): tick(9.0 + k * 0.12, 0.08)
thud(10.6); pop(11.1, 820)
# S4
whoosh(12.45, 0.45, 0.35); boing(13.0, 0.45); add(sfx, 13.05, noise(0.9, 0.35), 0.18); chime(13.05, 0.22)
thud(13.3, 0.8); pop(13.65, 900); pop(13.95, 700, 0.3)
# S5
whoosh(15.75, 0.4, 0.3); pop(16.6, 760); pop(17.2, 880); pop(17.8, 980); tick(18.4, 0.3)
# S6
pop(20.5, 700); thud(20.95, 0.4)
for k in range(28): tick(21.0 + k * 0.07, 0.12)
ding(22.1, 1318, 0.3); ding(22.5, 1480, 0.3); ding(22.9, 1760, 0.3); chime(23.25, 0.3)
# S7
whoosh(24.85, 0.4, 0.3); boing(25.0, 0.3); pop(25.3, 760); pop(25.7, 900); pop(26.4, 1000); chime(26.0, 0.18)

def write(name, buf, peak=0.9):
    m = max(1e-9, max(abs(v) for v in buf)); k = peak / m
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v * k)) * 32767)) for v in buf))
    print('wrote', name)

write('music.wav', music)
write('sfx.wav', sfx)
