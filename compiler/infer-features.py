# -*- coding: utf-8 -*-
# 反推工具：对比 upstream/index.html 的 feature 块与已编译的 app/commander.htm，
# 推断 NW.js 桌面版启用了哪些 feature（编译产物已去掉标记，只能靠特征串检测）。
import re, json, sys

src = open('upstream/index.html', encoding='utf-8', errors='ignore').read()
out = open('app/commander.htm', encoding='utf-8', errors='ignore').read()

# 解析所有正向块（忽略取反块，取反块用于反证）
pat = re.compile(r'###BEGIN###\{(!?)([^}]+)\}(.*?)###END###\{\1\2\}', re.S)
blocks = {}
for m in pat.finditer(src):
    neg, name, body = m.group(1) == '!', m.group(2), m.group(3)
    blocks.setdefault((name, neg), []).append(body)

def features_of(body_list):
    # 从块内容提取特征串：引号内字符串字面量（minify 不会改变），长度>=18
    sigs = []
    for body in body_list:
        for q in re.findall(r'"([^"\\\n]{18,120})"|\'([^\'\\\n]{18,120})\'', body):
            s = q[0] or q[1]
            if '###' in s: continue
            sigs.append(s)
    # 去重、优先较长的
    return sorted(set(sigs), key=len, reverse=True)[:12]

result = {}
names = sorted(set(n for (n, neg) in blocks))
for name in names:
    pos = blocks.get((name, False), [])
    sigs = features_of(pos)
    if not sigs:
        result[name] = {'status': 'unknown', 'reason': 'no signature strings'}
        continue
    hits = sum(1 for s in sigs if s in out)
    result[name] = {'status': 'enabled' if hits > 0 else 'disabled',
                    'hits': f'{hits}/{len(sigs)}'}

for name in names:
    r = result[name]
    print(f"{r['status']:9s} {name:35s} {r.get('hits','')}")
