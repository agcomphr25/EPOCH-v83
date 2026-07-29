from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUTPUT = Path(__file__).resolve().parents[2] / "output" / "pdf" / "part-specification-sheet-evidence.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 6)
    canvas.drawCentredString(
        landscape(letter)[0] / 2,
        0.25 * inch,
        f"SPEC-2026-001 | Rev B | RELEASED | 2026-07-29 | Page {doc.page} | "
        "Configuration Controlled | Uncontrolled When Printed",
    )
    canvas.restoreState()


def controlled_table(title, headers, rows, widths):
    data = [[Paragraph(f"<b>{header}</b>", styles["BodyText"]) for header in headers]]
    data.extend([[Paragraph(str(cell), styles["BodyText"]) for cell in row] for row in rows])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E5E7EB")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#6B7280")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return [Paragraph(title, styles["Heading2"]), table, Spacer(1, 0.18 * inch)]


story = [
    Paragraph("Part Specification Sheet - AV Tray Mount", styles["Title"]),
    Paragraph(
        "<b>Specification:</b> SPEC-2026-001 Rev B &nbsp;&nbsp; "
        "<b>Part:</b> AV-TRAY-100 Rev C &nbsp;&nbsp; "
        "<b>Drawing:</b> DWG-AV-100 Rev D &nbsp;&nbsp; "
        "<b>Routing:</b> ROUTE-AV-100 Rev 7",
        styles["BodyText"],
    ),
    Spacer(1, 0.15 * inch),
]

story += controlled_table(
    "Materials and Components",
    ["Qty", "Part Number", "Description", "Material Spec", "UOM", "Lot/Heat", "CoC", "Material Cert", "Notes"],
    [
        [1, "AL-6061-PLATE", "6061-T6 aluminum plate", "AMS 4027", "EA", "Yes", "Yes", "Yes", "Retain heat certification"],
        [4, "NAS1352C04", "Socket head cap screw", "NAS1352", "EA", "Lot", "Yes", "No", "Clean and bag"],
    ],
    [0.35*inch, 0.8*inch, 1.2*inch, 0.75*inch, 0.35*inch, 0.55*inch, 0.4*inch, 0.6*inch, 1.0*inch],
)

story += controlled_table(
    "CNC Operations",
    ["Seq", "Dept", "Operation", "Program", "Prog Rev", "Machine", "Fixture", "Setup", "Cycle", "Prove-out", "Source IDs"],
    [
        [10, "CNC", "Machine datum A", "AVTRAY-OP10", "E", "3-axis mill", "FX-AV-02", "25 min", "8 min", "Yes", "RO 1402 / CNC 88"],
        [20, "CNC", "Machine datum B", "AVTRAY-OP20", "C", "3-axis mill", "FX-AV-02", "12 min", "6 min", "No", "RO 1403 / CNC 89"],
    ],
    [0.3*inch, 0.45*inch, 0.9*inch, 0.8*inch, 0.45*inch, 0.7*inch, 0.65*inch, 0.45*inch, 0.45*inch, 0.5*inch, 0.9*inch],
)

qc_rows = []
for index in range(1, 43):
    nominal = 1.25 + index / 1000
    qc_rows.append(
        [
            f"KC-{index:02d} machined feature",
            f"{nominal:.3f}",
            "±0.005",
            f"{nominal - .005:.3f}",
            f"{nominal + .005:.3f}",
            "in",
            "CMM inspection",
            "CMM-01",
            "FINISH",
            "100%",
            "1",
            "0",
            "1",
            "Yes" if index % 7 == 0 else "No",
            f"DWG-AV-100 Rev D, zone {index}",
        ]
    )

story += [PageBreak()]
story += controlled_table(
    "QC Standards - multi-page evidence",
    ["Characteristic", "Nominal", "Tol", "Lower", "Upper", "Unit", "Method", "Gage", "Phase", "Coverage", "Sample", "Ac", "Re", "Hard Stop", "Reference"],
    qc_rows,
    [1.0*inch, 0.45*inch, 0.4*inch, 0.4*inch, 0.4*inch, 0.3*inch, 0.65*inch, 0.5*inch, 0.4*inch, 0.45*inch, 0.4*inch, 0.25*inch, 0.25*inch, 0.45*inch, 0.9*inch],
)

doc = SimpleDocTemplate(
    str(OUTPUT),
    pagesize=landscape(letter),
    leftMargin=0.4 * inch,
    rightMargin=0.4 * inch,
    topMargin=0.4 * inch,
    bottomMargin=0.45 * inch,
)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
