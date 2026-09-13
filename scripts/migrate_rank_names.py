from pathlib import Path
import re
import subprocess


def edit_api(path: Path) -> str:
    s = path.read_text(encoding='utf-8')
    s = s.replace(
        "const RANKS = ['Scalar', 'Integer', 'Prime', 'Vector', 'Matrix', 'Euler', 'Gauss', 'Infinity'];",
        "const RANKS = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Mathematician'];",
    )
    s = s.replace(
        "const COLORS = ['#8a8aa8','#72a0ff','#b26cff','#40e0f0','#f0e040','#40f070','#f09040','#f04070'];",
        "const COLORS = ['#8a8aa8','#a66a3f','#c0c0c0','#f0d84a','#40e0d0','#5a8cff','#b06cff','#f06ca8','#ff8a40'];",
    )
    s = re.sub(
        r"function rankName\(rankIndex\) \{.*?\n\}\n\nfunction rankIndexFromMmr\(mmr\) \{.*?\n\}",
        """function rankName(rankIndex) {
  if (rankIndex < 0) return 'Placement';
  if (rankIndex >= 24) return 'Mathematician';
  const r = RANKS[Math.floor(rankIndex / 3)];
  const tier = ['III','II','I'][rankIndex % 3];
  return `${r} ${tier}`;
}

function rankIndexFromMmr(mmr) {
  if (mmr >= 2500) return 24;
  return Math.max(0, Math.min(23, Math.floor((mmr - 700) / 75)));
}""",
        s,
        count=1,
        flags=re.S,
    )
    s = s.replace(
        "const local = Math.max(0, profile.mmr - (800 + profile.rankIndex * 100));",
        "const local = Math.max(0, profile.mmr - (700 + profile.rankIndex * 75));",
    )
    s = s.replace(
        "while (profile.rr >= 100 && profile.rankIndex < 21)",
        "while (profile.rr >= 100 && profile.rankIndex < 24)",
    )
    return s


def edit_client(path: Path) -> str:
    s = path.read_text(encoding='utf-8')
    s = s.replace(
        "const ranks = ['Scalar','Integer','Prime','Vector','Matrix','Euler','Gauss','Infinity'];",
        "const ranks = ['Rookie','Bronze','Silver','Gold','Platinum','Diamond','Master','Grandmaster','Mathematician'];",
    )
    s = s.replace(
        "const rankColor = i => ['#8a8aa8','#72a0ff','#b26cff','#40e0f0','#f0e040','#40f070','#f09040','#f04070'][Math.min(7, Math.max(0, Math.floor(Math.max(0,i)/3)))];",
        "const rankColor = i => ['#8a8aa8','#a66a3f','#c0c0c0','#f0d84a','#40e0d0','#5a8cff','#b06cff','#f06ca8','#ff8a40'][Math.min(8, Math.max(0, Math.floor(Math.max(0,i)/3)))];",
    )
    s = s.replace(
        "if (Number(p.rankIndex) >= 21) return 'Infinity';",
        "if (Number(p.rankIndex) >= 24) return 'Mathematician';",
    )
    s = s.replace(
        "${i===7?'∞ RR':'III · II · I'}",
        "${i===8?'TOP RANK':'III · II · I'}",
    )
    return s


api = Path('api/competitive.js')
client = Path('competitive.js')
api.write_text(edit_api(api), encoding='utf-8')
client.write_text(edit_client(client), encoding='utf-8')

subprocess.run(['node', '--check', str(api)], check=True)
subprocess.run(['node', '--check', str(client)], check=True)

for p in (api, client):
    t = p.read_text(encoding='utf-8')
    for old in ['Scalar','Integer','Prime','Vector','Matrix','Euler','Gauss','Infinity']:
        if old in t:
            raise SystemExit(f'{p}: old rank name remains: {old}')

subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True)
subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], check=True)
subprocess.run(['git', 'add', str(api), str(client)], check=True)
if subprocess.run(['git', 'diff', '--cached', '--quiet']).returncode == 0:
    raise SystemExit('No rank changes were needed')
subprocess.run(['git', 'commit', '-m', 'Rombak competitive rank system [skip-rank-names]'], check=True)
subprocess.run(['git', 'push'], check=True)
