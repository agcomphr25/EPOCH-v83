import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderPartSpecificationSheetPdf } from '../src/lib/partSpecificationSheetPdf';

const output = path.resolve(
  'output',
  'pdf',
  'part-specification-sheet-evidence.pdf'
);
const columns = (entries: Array<[string, string, number?]>) =>
  entries.map(([key, label, width = 1]) => ({ key, label, width }));

const materials = [
  {
    quantity: 1,
    partNumber: 'AL-6061-PLATE',
    description: '6061-T6 aluminum plate with retained heat certification',
    materialSpecification: 'AMS 4027',
    unitOfMeasure: 'EA',
    lotHeatRequired: true,
    certificateOfConformanceRequired: true,
    materialCertificationRequired: true,
    notes: 'Retain certification with the permanent manufacturing record.',
  },
  {
    quantity: 4,
    partNumber: 'NAS1352C04',
    description: 'Socket head cap screw',
    materialSpecification: 'NAS1352',
    unitOfMeasure: 'EA',
    lotHeatRequired: true,
    certificateOfConformanceRequired: true,
    materialCertificationRequired: false,
    notes: 'Clean, bag, and protect threads before issue.',
  },
];

const cncOperations = [10, 20].map((sequence, index) => ({
  stepNumber: sequence,
  departmentName: 'CNC',
  operationName: `Machine datum ${index ? 'B' : 'A'} with a deliberately long instruction that must wrap without clipping`,
  programNumber: `AVTRAY-OP${sequence}`,
  programRevision: index ? 'C' : 'E',
  preferredMachine: '3-axis mill',
  fixture: 'FX-AV-02',
  estimatedSetupMinutes: index ? 12 : 25,
  estimatedCycleMinutes: index ? 6 : 8,
  proveOutRequired: index === 0,
  sourceRoutingOperationId: `00000000-0000-0000-0000-0000000014${index + 2}`,
  sourceCncOperationId: `00000000-0000-0000-0000-00000000008${index + 8}`,
}));

const qcStandards = Array.from({ length: 42 }, (_, offset) => {
  const index = offset + 1;
  const nominal = 1.25 + index / 1000;
  return {
    standard: `KC-${String(index).padStart(2, '0')} machined feature`,
    requirement: nominal.toFixed(3),
    tolerance: '+/-0.005',
    lowerLimit: (nominal - 0.005).toFixed(3),
    upperLimit: (nominal + 0.005).toFixed(3),
    unit: 'in',
    inspectionMethod: 'CMM inspection',
    gage: 'CMM-01',
    inspectionPhase: 'FINISH',
    coverage: '100%',
    sampleSize: 1,
    acceptNumber: 0,
    rejectNumber: 1,
    hardQcStop: index % 7 === 0,
    referenceLink: `DWG-AV-100 Rev D, feature zone ${index}; this controlled reference must wrap cleanly`,
  };
});

const templateFields = [
  {
    fieldName: 'materials',
    fieldLabel: 'Materials and Components',
    fieldType: 'repeatable_table',
    sectionName: 'Materials',
    columns: columns([
      ['quantity', 'Qty', 0.5],
      ['partNumber', 'Part Number', 1],
      ['description', 'Description', 1.5],
      ['materialSpecification', 'Material Spec', 1],
      ['unitOfMeasure', 'UOM', 0.5],
      ['lotHeatRequired', 'Lot/Heat', 0.7],
      ['certificateOfConformanceRequired', 'CoC', 0.6],
      ['materialCertificationRequired', 'Material Cert', 0.8],
      ['notes', 'Notes', 1.4],
    ]),
  },
  {
    fieldName: 'cncOperations',
    fieldLabel: 'CNC Operations',
    fieldType: 'cnc_operations_table',
    sectionName: 'CNC Operations',
    columns: columns([
      ['stepNumber', 'Seq', 0.5],
      ['departmentName', 'Dept', 0.6],
      ['operationName', 'Operation', 1.5],
      ['programNumber', 'Program', 1],
      ['programRevision', 'Prog Rev', 0.6],
      ['preferredMachine', 'Machine', 0.9],
      ['fixture', 'Fixture', 0.8],
      ['estimatedSetupMinutes', 'Setup', 0.6],
      ['estimatedCycleMinutes', 'Cycle', 0.6],
      ['proveOutRequired', 'Prove-out', 0.7],
      ['sourceCncOperationId', 'Source ID', 1.2],
    ]),
  },
  {
    fieldName: 'qcStandards',
    fieldLabel: 'QC Standards',
    fieldType: 'qc_standards_table',
    sectionName: 'QC Standards',
    columns: columns([
      ['standard', 'Characteristic', 1.5],
      ['requirement', 'Nominal', 0.7],
      ['tolerance', 'Tol', 0.6],
      ['lowerLimit', 'Lower', 0.6],
      ['upperLimit', 'Upper', 0.6],
      ['unit', 'Unit', 0.4],
      ['inspectionMethod', 'Method', 0.9],
      ['gage', 'Gage', 0.7],
      ['inspectionPhase', 'Phase', 0.6],
      ['coverage', 'Coverage', 0.7],
      ['sampleSize', 'Sample', 0.5],
      ['acceptNumber', 'Ac', 0.35],
      ['rejectNumber', 'Re', 0.35],
      ['hardQcStop', 'Hard Stop', 0.6],
      ['referenceLink', 'Reference', 1.3],
    ]),
  },
];

async function main() {
  const pdf = await renderPartSpecificationSheetPdf({
    title: 'Part Specification Sheet - AV Tray Mount',
    sku: 'AV-TRAY-100',
    partNumber: 'AV-TRAY-100',
    partName: 'AV Tray Mount',
    documentNumber: 'SPEC-2026-001',
    revision: 'B',
    status: 'RELEASED',
    effectiveDate: '2026-07-30',
    templateSections: [
      { name: 'Materials' },
      { name: 'CNC Operations' },
      { name: 'QC Standards' },
    ],
    templateFields,
    fieldValues: { materials, cncOperations, qcStandards },
  });

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, pdf);
  process.stdout.write(`${output}\n`);
}

void main();
