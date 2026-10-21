# Mengubah Markdown -> PDF (pandoc -> HTML -> Chromium). Pemakaian: python3 docs/build_pdf.py in.md out.pdf
import subprocess, sys, tempfile
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
css = """body{font-family:'DejaVu Sans',Arial,sans-serif;font-size:10pt;line-height:1.4;margin:0}
h1{font-size:17pt;border-bottom:2px solid #0b6b3a;padding-bottom:4px} h2{font-size:13pt;color:#0b6b3a;margin-top:16px}
table{border-collapse:collapse;width:100%;font-size:8.5pt;margin:8px 0} th,td{border:1px solid #999;padding:3px 5px;vertical-align:top}
th{background:#e3f2e6} code,pre{font-family:'DejaVu Sans Mono',monospace;font-size:8pt;word-break:break-all} pre{background:#f4f4f4;padding:6px;white-space:pre-wrap}
blockquote{border-left:3px solid #0b6b3a;margin-left:0;padding-left:10px;color:#333}"""
html = subprocess.run(["pandoc", src, "-f", "gfm", "-t", "html", "-s", "--metadata", "title= ", "-c", "/dev/null"], capture_output=True, text=True).stdout
html = html.replace("</head>", f"<style>{css}</style></head>").replace('<h1 class="title"> </h1>', "")
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.set_content(html)
    pg.pdf(path=out, format="A4", margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"}, print_background=True)
    b.close()
print("PDF:", out)
