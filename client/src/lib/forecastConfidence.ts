export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export function getConfidenceLabel(score: number | string): ConfidenceLevel {
  if (typeof score === 'string') {
    const upper = score.toUpperCase();
    if (upper === 'HIGH') return 'High';
    if (upper === 'MEDIUM') return 'Medium';
    return 'Low';
  }
  if (score > 0.75) return 'High';
  if (score > 0.45) return 'Medium';
  return 'Low';
}

export function getConfidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'High':
      return 'text-green-700 border-green-500 bg-green-50';
    case 'Medium':
      return 'text-amber-700 border-amber-500 bg-amber-50';
    case 'Low':
      return 'text-red-700 border-red-500 bg-red-50';
  }
}

export function getConfidenceDotColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'High':
      return 'bg-green-500';
    case 'Medium':
      return 'bg-amber-500';
    case 'Low':
      return 'bg-red-500';
  }
}
