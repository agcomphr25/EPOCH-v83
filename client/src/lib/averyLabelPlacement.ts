export interface AveryLabelPlacement {
  pageNumber: number;
  cellIndex: number;
}

export function getAveryLabelPlacements(
  labelCount: number,
  labelsPerPage: number,
  skippedFirstPageCells: number[] = []
): AveryLabelPlacement[] {
  if (labelCount <= 0 || labelsPerPage <= 0) return [];

  const skippedCells = new Set(
    skippedFirstPageCells.filter(
      (cell) => Number.isInteger(cell) && cell >= 0 && cell < labelsPerPage
    )
  );
  const firstPageCells = Array.from(
    { length: labelsPerPage },
    (_, index) => index
  ).filter((index) => !skippedCells.has(index));

  return Array.from({ length: labelCount }, (_, labelIndex) => {
    if (labelIndex < firstPageCells.length) {
      return { pageNumber: 0, cellIndex: firstPageCells[labelIndex] };
    }

    const laterIndex = labelIndex - firstPageCells.length;
    return {
      pageNumber: 1 + Math.floor(laterIndex / labelsPerPage),
      cellIndex: laterIndex % labelsPerPage,
    };
  });
}
