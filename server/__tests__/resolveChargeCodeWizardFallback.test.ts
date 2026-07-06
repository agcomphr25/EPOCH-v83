import { describe, expect, it } from 'vitest';
import { pickWizardChargeCode } from '../src/lib/resolveChargeCode';

describe('pickWizardChargeCode', () => {
  it('resolves a code from an exact WAD Step 4 department match', () => {
    const wizardData = {
      step4: {
        chargeCodes: [
          { department: 'CNC', operation: 'Machine', chargeCode: 'JOB-002' },
          { department: 'QC', operation: 'Final inspection', chargeCode: 'QC-002' },
        ],
      },
    };

    expect(pickWizardChargeCode(wizardData, 'CNC')).toBe('JOB-002');
    expect(pickWizardChargeCode(wizardData, 'Quality Control')).toBe('QC-002');
  });

  it('uses the single non-QC code for generic job traveler departments', () => {
    const wizardData = {
      step4: {
        chargeCodes: [
          { department: 'JOB', operation: 'Production job', chargeCode: 'JOB-002' },
          { department: 'QC', operation: 'Quality review', chargeCode: 'QC-002' },
        ],
      },
    };

    expect(pickWizardChargeCode(wizardData, 'Production')).toBe('JOB-002');
  });

  it('does not use a QC code as a generic production fallback', () => {
    const wizardData = {
      step4: {
        chargeCodes: [
          { department: 'QC', operation: 'Quality review', chargeCode: 'QC-002' },
        ],
      },
    };

    expect(pickWizardChargeCode(wizardData, 'Production')).toBeNull();
  });
});
