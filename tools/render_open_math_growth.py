"""Render the pinned theorem census with Matplotlib; no build-time dependency.

Usage: python tools/render_open_math_growth.py
Requires matplotlib in the rendering environment only.
"""
from pathlib import Path
from datetime import datetime
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as dates
from matplotlib.ticker import FuncFormatter

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'site/assets/open-math/theorem-growth.json').read_text())
points = data['points']
x = [datetime.fromisoformat(p['source_time']) for p in points]
y = [p['theorems'] for p in points]
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 12, 'svg.hashsalt': 'sair-theorem-growth-v1'})
fig, ax = plt.subplots(figsize=(8.6, 3.35))
fig.patch.set_alpha(0)
ax.set_facecolor('none')
ax.fill_between(x, y, 0, color='#b8de91', alpha=.10)
ax.plot(x, y, color='#d0eaa0', linewidth=3, solid_capstyle='round')
ax.scatter([x[0],x[-1]], [y[0],y[-1]], s=[26,65], c='#d0eaa0', zorder=3)
ax.annotate(f'{y[0]:,}', (x[0],y[0]), xytext=(0,14), textcoords='offset points', color='#f4f1e8', fontsize=13)
ax.annotate(f'{y[-1]:,}', (x[-1],y[-1]), xytext=(-6,14), textcoords='offset points', color='#d0eaa0', ha='right', fontsize=15, weight='bold')
ax.set_ylim(0,41000)
ax.set_xlim(x[0],x[-1])
ax.set_yticks([0,10000,20000,30000,40000])
ax.yaxis.set_major_formatter(FuncFormatter(lambda v,p:'0' if v==0 else f'{v/1000:.0f}k'))
ax.set_xticks([x[0],datetime.fromisoformat('2026-09-10T00:00:00+08:00'),datetime.fromisoformat('2026-09-18T00:00:00+08:00'),x[-1]])
ax.xaxis.set_major_formatter(dates.DateFormatter('%m/%d',tz=x[0].tzinfo))
ax.tick_params(axis='both',colors='#b4c7b8',length=0,pad=9,labelsize=11)
ax.grid(axis='y',color='#87a796',alpha=.22,linewidth=.7)
for spine in ax.spines.values():spine.set_visible(False)
ax.set_axisbelow(True)
fig.subplots_adjust(left=.075,right=.965,bottom=.15,top=.95)
fig.savefig(ROOT/'site/assets/open-math/theorem-growth.svg',transparent=True,metadata={'Date':None,'Description':'Frozen theorem statement census, published source commits; linear axes, zero baseline.'})
plt.close(fig)
