"""Create a static, printable copy of the multi-view user study.

The resulting PDF is for off-line participation only.  It intentionally shows
the five results as A--E; keep the generated answer key private.
"""
from __future__ import annotations

import csv
import random
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "study-site" / "assets"
OUT = ROOT / "user-study-questionnaire.pdf"
KEY = ROOT / "user-study-questionnaire-answer-key.csv"
FONT = Path("/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf")
LATIN_FONT = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
PAGE = (2339, 1654)  # A4 landscape at 200 dpi
MARGIN = 75
METHODS = ("ours", "editsplat", "gaussctrl", "imix2mix", "rl3d")
LETTERS = ("A", "B", "C", "D", "E")


@dataclass(frozen=True)
class MixedFont:
    size: int
    latin: ImageFont.FreeTypeFont
    cjk: ImageFont.FreeTypeFont


def font(size: int) -> MixedFont:
    # Droid Sans Fallback has the Chinese glyphs required here but lacks basic
    # Latin glyphs on this host.  Use DejaVu for ASCII letters and numbers.
    return MixedFont(size, ImageFont.truetype(str(LATIN_FONT), size), ImageFont.truetype(str(FONT), size))


def cjk_character(character: str) -> bool:
    return ord(character) >= 0x2E80


def font_runs(text: str):
    if not text:
        return []
    runs, current, current_cjk = [], text[0], cjk_character(text[0])
    for character in text[1:]:
        uses_cjk = cjk_character(character)
        if uses_cjk != current_cjk:
            runs.append((current, current_cjk))
            current, current_cjk = character, uses_cjk
        else:
            current += character
    runs.append((current, current_cjk))
    return runs


def text_width(draw: ImageDraw.ImageDraw, text: str, face: MixedFont) -> float:
    return sum(draw.textlength(run, font=face.cjk if uses_cjk else face.latin) for run, uses_cjk in font_runs(text))


def draw_text(draw: ImageDraw.ImageDraw, xy, text: str, face: MixedFont, fill):
    x, y = xy
    for run, uses_cjk in font_runs(text):
        active = face.cjk if uses_cjk else face.latin
        draw.text((x, y), run, font=active, fill=fill)
        x += draw.textlength(run, font=active)


def study_cases():
    source = (ROOT / "study-site" / "data.js").read_text(encoding="utf-8")
    pairs = re.findall(r'"id":\s*"([^"]+)"\s*,\s*"prompt":\s*"([^"]+)"', source)
    if len(pairs) != 10:
        raise RuntimeError("Could not read all ten cases from study-site/data.js")
    return pairs


def lines(draw: ImageDraw.ImageDraw, text: str, max_width: int, face, *, split_words=False):
    """Wrap Chinese/English text without relying on optional layout libraries."""
    result, current = [], ""
    tokens = text.split(" ") if split_words else list(text)
    separator = " " if split_words else ""
    for token in tokens:
        candidate = token if not current else current + separator + token
        if current and text_width(draw, candidate, face) > max_width:
            result.append(current)
            current = token
        else:
            current = candidate
    if current:
        result.append(current)
    return result


def draw_wrapped(draw, xy, text, max_width, face, fill="#202f2d", leading=10, split_words=False):
    x, y = xy
    for line in lines(draw, text, max_width, face, split_words=split_words):
        draw_text(draw, (x, y), line, face, fill)
        y += face.size + leading
    return y


def base_page():
    return Image.new("RGB", PAGE, "#f6f7f2")


def title_page():
    page = base_page()
    draw = ImageDraw.Draw(page)
    draw_text(draw, (MARGIN, 120), "VIEW / STUDY", font(37), "#246b59")
    draw_text(draw, (MARGIN, 205), "三维场景编辑评价", font(83), "#202f2d")
    draw_text(draw, (MARGIN, 318), "离线填写版用户研究问卷", font(39), "#687571")
    y = 470
    draw_text(draw, (MARGIN, y), "填写说明", font(43), "#202f2d")
    y += 76
    instructions = (
        "本问卷含 10 个编辑样例。每题展示一组原始多视角图像（Original）、一条编辑指令，"
        "以及 A–E 五组候选编辑结果。每一张图均由同一场景的四个视角组成。",
        "请分别从三个维度选择表现最好的一组：指令遵循、跨视角一致性、视觉质量。"
        "三个维度可选择同一组或不同组。",
        "请在每题底部记录 A–E 的选择；完成后，将 PDF 或答案页发回研究者。"
        "本 PDF 不会自动上传或保存答案。",
    )
    for number, instruction in enumerate(instructions, 1):
        draw.ellipse((MARGIN, y + 5, MARGIN + 35, y + 40), fill="#246b59")
        draw_text(draw, (MARGIN + 10, y + 6), str(number), font(20), "white")
        y = draw_wrapped(draw, (MARGIN + 58, y), instruction, PAGE[0] - 2 * MARGIN - 58, font(32), leading=18)
        y += 33
    y += 24
    definitions = [
        ("指令遵循", "编辑是否准确、充分地实现指定的编辑目标？"),
        ("跨视角一致性", "同一场景的编辑是否在不同视角下保持连贯一致？"),
        ("视觉质量", "图像是否自然、清晰，且无明显模糊、伪影或结构失真？"),
    ]
    for name, detail in definitions:
        draw.rounded_rectangle((MARGIN, y, PAGE[0] - MARGIN, y + 104), radius=14, fill="white", outline="#dbe2db", width=2)
        draw_text(draw, (MARGIN + 25, y + 17), name, font(29), "#202f2d")
        draw_text(draw, (MARGIN + 360, y + 20), detail, font(25), "#687571")
        y += 124
    draw_text(draw, (MARGIN, PAGE[1] - 110), "研究者：请勿将 answer-key CSV 发给参与者。", font(24), "#a13c29")
    return page


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.convert("RGB")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


def question_page(number: int, case_id: str, prompt: str, order: list[str]):
    page = base_page()
    draw = ImageDraw.Draw(page)
    draw_text(draw, (MARGIN, 36), f"样例 {number} / 10", font(28), "#246b59")
    draw_text(draw, (MARGIN + 250, 36), "EDITING PROMPT", font(24), "#687571")
    draw_wrapped(draw, (MARGIN, 88), prompt, PAGE[0] - 2 * MARGIN, font(36), leading=8, split_words=True)
    top, bottom = 175, 1365
    gap = 26
    cell_w = (PAGE[0] - 2 * MARGIN - 2 * gap) // 3
    cell_h = (bottom - top - gap) // 2
    labels = ["Original", *LETTERS]
    methods = ["original", *order]
    for index, (label, method) in enumerate(zip(labels, methods)):
        row, col = divmod(index, 3)
        x, y = MARGIN + col * (cell_w + gap), top + row * (cell_h + gap)
        draw.rounded_rectangle((x, y, x + cell_w, y + cell_h), radius=12, fill="white", outline="#8caa99" if index == 0 else "#dbe2db", width=2)
        draw_text(draw, (x + 20, y + 15), label, font(32), "#202f2d")
        suffix = "原始参考" if index == 0 else "候选编辑结果"
        draw_text(draw, (x + 20, y + 59), suffix, font(20), "#687571")
        asset = ASSETS / case_id / f"{method}.webp"
        if not asset.exists():
            raise FileNotFoundError(asset)
        with Image.open(asset) as source:
            picture = contain(source, (cell_w - 30, cell_h - 112))
        px = x + (cell_w - picture.width) // 2
        py = y + 98 + (cell_h - 112 - picture.height) // 2
        page.paste(picture, (px, py))
    draw.rounded_rectangle((MARGIN, 1400, PAGE[0] - MARGIN, 1575), radius=12, fill="white", outline="#dbe2db", width=2)
    draw_text(draw, (MARGIN + 25, 1422), "本题选择（填写最优组别）：", font(28), "#202f2d")
    draw_text(draw, (MARGIN + 35, 1486), "指令遵循：______    跨视角一致性：______    视觉质量：______", font(30), "#246b59")
    return page


def answer_sheet():
    page = base_page()
    draw = ImageDraw.Draw(page)
    draw_text(draw, (MARGIN, 80), "答案回传页", font(62), "#202f2d")
    draw_text(draw, (MARGIN, 175), "参与者姓名/编号：________________________", font(30), "#687571")
    columns = ("样例", "指令遵循", "跨视角一致性", "视觉质量")
    x = MARGIN
    widths = (250, 600, 700, 620)
    y, height = 290, 110
    for label, width in zip(columns, widths):
        draw.rectangle((x, y, x + width, y + height), fill="#246b59")
        draw_text(draw, (x + 18, y + 31), label, font(27), "white")
        x += width
    for row in range(10):
        x, top = MARGIN, y + height * (row + 1)
        for column, width in enumerate(widths):
            draw.rectangle((x, top, x + width, top + height), fill="white", outline="#dbe2db", width=2)
            if column == 0:
                draw_text(draw, (x + 25, top + 31), f"样例 {row + 1}", font(27), "#202f2d")
            else:
                draw_text(draw, (x + 20, top + 31), "A  /  B  /  C  /  D  /  E", font(25), "#687571")
            x += width
    draw_text(draw, (MARGIN, 1508), "请将这一页的照片、扫描件或整个 PDF 回传给研究者。", font(27), "#687571")
    return page


def main():
    if not FONT.exists():
        raise FileNotFoundError(f"Chinese font not found: {FONT}")
    cases = study_cases()
    pages = [title_page()]
    rows = []
    for number, (case_id, prompt) in enumerate(cases, 1):
        order = list(METHODS)
        random.Random(f"printable-study-v1:{case_id}").shuffle(order)
        pages.append(question_page(number, case_id, prompt, order))
        rows.append({"sample": case_id, **dict(zip(LETTERS, order))})
    pages.append(answer_sheet())
    pages[0].save(OUT, "PDF", save_all=True, append_images=pages[1:], resolution=200.0, quality=90)
    with KEY.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=("sample", *LETTERS))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Created: {OUT}")
    print(f"Private answer key: {KEY}")


if __name__ == "__main__":
    main()
