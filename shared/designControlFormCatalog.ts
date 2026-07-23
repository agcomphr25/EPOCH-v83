import {
  DESIGN_CONTROL_WORKFLOW,
  type DesignControlWorkflowItem,
} from './designControlWorkflow';

export const DESIGN_CONTROL_TEMPLATE_SCHEMA_VERSION = '1.0.0';
export const DESIGN_CONTROL_FORM_RENDERER_VERSION =
  'design-control-blank-pdf/1';

export type DesignControlFormField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'checkbox' | 'attachment' | 'signature';
  required: boolean;
};

export type DesignControlFormSection = {
  key: string;
  title: string;
  repeating: boolean;
  fields: readonly DesignControlFormField[];
};

export type DesignControlFormDefinition = {
  templateKey: string;
  documentNumber: string;
  title: string;
  purpose: string;
  formCategory:
    | 'DESIGN_CONTROL_STEP'
    | 'ENGINEERING_CHANGE_REQUEST'
    | 'ENGINEERING_CHANGE_NOTICE';
  workflowStepKey: string | null;
  changeRecordType: 'ECR' | 'ECN' | null;
  sections: readonly DesignControlFormSection[];
  approvalRoles: readonly string[];
  identification: {
    department: 'Engineering';
    documentType: 'Design Control Form';
    footerText: 'Configuration Controlled — verify current revision in the Master Document Register';
    requiredHeaderFields: readonly string[];
  };
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const field = (
  item: DesignControlWorkflowItem,
  type: DesignControlFormField['type'] = 'textarea',
  required = true
): DesignControlFormField => ({
  key: item.key || slug(item.label),
  label: item.label,
  type,
  required,
});

const stepDefinitions: DesignControlFormDefinition[] =
  DESIGN_CONTROL_WORKFLOW.map((step) => ({
    templateKey: `design-control-step-${String(step.order).padStart(2, '0')}`,
    documentNumber: `DCF-${String(step.order).padStart(3, '0')}`,
    title:
      step.title === 'Design Inputs / Requirements'
        ? 'Design Inputs and Requirements'
        : step.title === 'Requirements Review Checklist'
          ? 'Requirements Review'
          : step.title,
    purpose: step.purpose,
    formCategory: 'DESIGN_CONTROL_STEP',
    workflowStepKey: step.key,
    changeRecordType: null,
    sections: [
      {
        key: 'identification',
        title: 'Project and Design Control Identification',
        repeating: false,
        fields: [
          {
            key: 'rd_project_number',
            label: 'R&D Project Number',
            type: 'text',
            required: true,
          },
          {
            key: 'design_control_record',
            label: 'Design Control Record',
            type: 'text',
            required: true,
          },
          {
            key: 'responsible_engineer',
            label: 'Responsible Engineer',
            type: 'text',
            required: true,
          },
          {
            key: 'record_date',
            label: 'Record Date',
            type: 'date',
            required: true,
          },
        ],
      },
      {
        key: 'form_content',
        title: step.title,
        repeating: ['3', '5', '8', '9', '10'].includes(step.key),
        fields: step.fields.map((item) => field(item)),
      },
      ...(step.checklist.length
        ? [
            {
              key: 'checklist',
              title: 'Required Checklist',
              repeating: false,
              fields: step.checklist.map((item) => field(item, 'checkbox')),
            },
          ]
        : []),
      {
        key: 'approvals',
        title: 'Review and Approval',
        repeating: false,
        fields: step.approvals.map((item) => field(item, 'signature')),
      },
    ],
    approvalRoles: step.approvals.map((item) => item.label),
    identification: {
      department: 'Engineering',
      documentType: 'Design Control Form',
      footerText:
        'Configuration Controlled — verify current revision in the Master Document Register',
      requiredHeaderFields: [
        'R&D Project',
        'Design Control Record',
        'Document Number',
        'Revision',
      ],
    },
  }));

const changeDefinition = (
  index: 13 | 14,
  kind: 'ECR' | 'ECN',
  title: string,
  purpose: string,
  fields: readonly string[]
): DesignControlFormDefinition => ({
  templateKey: `design-control-${kind.toLowerCase()}`,
  documentNumber: `DCF-${String(index).padStart(3, '0')}`,
  title,
  purpose,
  formCategory:
    kind === 'ECR' ? 'ENGINEERING_CHANGE_REQUEST' : 'ENGINEERING_CHANGE_NOTICE',
  workflowStepKey: null,
  changeRecordType: kind,
  sections: [
    {
      key: 'identification',
      title: 'Change and Design Project Identification',
      repeating: false,
      fields: [
        {
          key: 'rd_project_number',
          label: 'R&D Project Number',
          type: 'text',
          required: true,
        },
        {
          key: `${kind.toLowerCase()}_number`,
          label: `${kind} Number`,
          type: 'text',
          required: true,
        },
        {
          key: 'requested_by',
          label: kind === 'ECR' ? 'Requested By' : 'Issued By',
          type: 'text',
          required: true,
        },
        { key: 'record_date', label: 'Date', type: 'date', required: true },
      ],
    },
    {
      key: 'change_content',
      title,
      repeating: false,
      fields: fields.map((label) => ({
        key: slug(label),
        label,
        type: 'textarea' as const,
        required: true,
      })),
    },
    {
      key: 'approvals',
      title: 'Review and Approval',
      repeating: false,
      fields: [
        'Engineering Approval',
        'Quality Approval',
        'Document Control Approval',
      ].map((label) => ({
        key: slug(label),
        label,
        type: 'signature' as const,
        required: true,
      })),
    },
  ],
  approvalRoles: ['Engineering', 'Quality', 'Document Control'],
  identification: {
    department: 'Engineering',
    documentType: 'Design Control Form',
    footerText:
      'Configuration Controlled — verify current revision in the Master Document Register',
    requiredHeaderFields: [
      'R&D Project',
      `${kind} Number`,
      'Document Number',
      'Revision',
    ],
  },
});

export const DESIGN_CONTROL_FORM_CATALOG = [
  ...stepDefinitions,
  changeDefinition(
    13,
    'ECR',
    'Engineering Change Request',
    'Request and assess a proposed change without implementing an ECR workflow in this phase.',
    [
      'Change requested',
      'Reason for change',
      'Affected controlled items',
      'Impact assessment',
      'Proposed verification and validation',
    ]
  ),
  changeDefinition(
    14,
    'ECN',
    'Engineering Change Notice',
    'Provide the controlled notice definition used by a future ECN workflow.',
    [
      'Approved change summary',
      'Affected released baselines',
      'Implementation instructions',
      'Effectivity',
      'Verification of implementation',
    ]
  ),
] as const satisfies readonly DesignControlFormDefinition[];

export const DESIGN_CONTROL_FORM_CATALOG_BY_KEY = new Map(
  DESIGN_CONTROL_FORM_CATALOG.map((definition) => [
    definition.templateKey,
    definition,
  ])
);
