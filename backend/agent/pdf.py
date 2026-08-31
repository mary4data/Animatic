"""Deck PDF export -- plain function, not an ADK tool.

Pure mechanical assembly of already-generated data (storyboard images already
on local disk, scene text already in the Job model) -- no LLM call needed,
so this lives outside agent/tools. Typography leans on reportlab's built-in
fonts (Helvetica/Courier) styled in the app's own compositional language
(bordered frames, uppercase label headers, a signal-red accent rule) rather
than embedding the app's actual webfonts (Fraunces/Space Mono) -- a
reasonable simplification for this build, flagged rather than done silently.
"""

from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

from agent.schemas import Job
from agent.storage import STORAGE_ROOT

PAGE_W, PAGE_H = letter
MARGIN = 48
CONTENT_W = PAGE_W - 2 * MARGIN

INK = HexColor("#252321")
ACCENT = HexColor("#c0392b")
MUTED = HexColor("#8a8479")

BODY_STYLE = ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=14, textColor=INK)
DIALOGUE_STYLE = ParagraphStyle(
    "dialogue", fontName="Helvetica-Oblique", fontSize=10, leading=15, textColor=INK
)


def _image_path(job_id: str, url: str):
    filename = url.rsplit("/", 1)[-1]
    return STORAGE_ROOT / job_id / filename


def _draw_wrapped(c: canvas.Canvas, text: str, style: ParagraphStyle, x: float, top_y: float) -> float:
    """Draws a wrapped Paragraph with its top edge at top_y; returns the y just below it."""
    paragraph = Paragraph(xml_escape(text), style)
    _, height = paragraph.wrap(CONTENT_W, PAGE_H)
    paragraph.drawOn(c, x, top_y - height)
    return top_y - height


def generate_deck_pdf(job: Job) -> bytes:
    """Renders the finished pitch package as a PDF, one scene per page:
    heading/title, storyboard frames, mood/score, synopsis, and the full
    voiced-dialogue transcript."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)

    scenes = [job.scenes[sid] for sid in job.scene_order if sid in job.scenes]
    for scene in scenes:
        y = PAGE_H - MARGIN

        c.setFont("Courier-Bold", 8)
        c.setFillColor(MUTED)
        c.drawString(MARGIN, y, f"BEAT {scene.number} / {scene.heading}".upper())
        y -= 26

        c.setFont("Helvetica-Bold", 24)
        c.setFillColor(INK)
        c.drawString(MARGIN, y, scene.title)
        y -= 10

        c.setStrokeColor(INK)
        c.setLineWidth(1.5)
        c.line(MARGIN, y, PAGE_W - MARGIN, y)
        y -= 20

        if scene.images:
            n = len(scene.images)
            gap = 8
            img_w = (CONTENT_W - gap * (n - 1)) / n
            img_h = img_w / 2  # matches the app's 2:1 storyboard-frame aspect
            x = MARGIN
            for image in scene.images:
                path = _image_path(job.job_id, image.url)
                if path.exists():
                    c.drawImage(
                        ImageReader(str(path)),
                        x,
                        y - img_h,
                        width=img_w,
                        height=img_h,
                        preserveAspectRatio=True,
                        anchor="c",
                    )
                c.setStrokeColor(INK)
                c.setLineWidth(0.75)
                c.rect(x, y - img_h, img_w, img_h, stroke=1, fill=0)
                x += img_w + gap
            y -= img_h + 20

        if scene.mood:
            c.setFont("Helvetica-Oblique", 12)
            c.setFillColor(INK)
            c.drawString(MARGIN, y, scene.mood)
            y -= 18

        if scene.score:
            y = _draw_wrapped(c, scene.score, BODY_STYLE, MARGIN, y)
            y -= 12

        y = _draw_wrapped(c, scene.synopsis, BODY_STYLE, MARGIN, y)
        y -= 20

        c.setFont("Courier-Bold", 8)
        c.setFillColor(MUTED)
        c.drawString(MARGIN, y, "VOICED DIALOGUE")
        y -= 18

        for d in scene.dialogue:
            if y < MARGIN + 50:
                c.showPage()
                y = PAGE_H - MARGIN

            c.setFont("Courier-Bold", 8)
            c.setFillColor(ACCENT)
            c.drawString(MARGIN, y, d.speaker.upper())
            y -= 13

            y = _draw_wrapped(c, f"“{d.line}”", DIALOGUE_STYLE, MARGIN, y)
            y -= 12

        c.showPage()

    c.save()
    return buf.getvalue()
