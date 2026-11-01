"""Los HTML autónomos conservan Local/CPU y no ofrecen un backend en file://."""
import re

def local_only(html):
    html = html.replace('<link rel="stylesheet" href="../online/new-game.css">', '')
    html = html.replace('<script type="module" src="../online/new-game.mjs"></script>', '')
    html = re.sub(r'\s*<button[^>]*data-online-control[^>]*>[\s\S]*?</button>', '', html)
    html = re.sub(r'<fieldset data-online-players[\s\S]*?</fieldset>', '', html)
    html = re.sub(r'<label class="online-pending"[\s\S]*?</label>', '', html)
    html = re.sub(r'<p id="arenaOnlinePending"[\s\S]*?</p>', '', html)
    html = re.sub(r'<script type="module" src="\.\.?/online/continue\.mjs"></script>', '', html)
    return html
