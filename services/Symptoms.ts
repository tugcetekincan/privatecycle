/**
 * Shared symptom catalog: the Track screen, the calendar day modal and the
 * Insights symptom patterns all render the same ids, labels and icons.
 */

export interface SymptomOption {
  id: string;
  label: string;
  icon: string;
}

export const SYMPTOMS: SymptomOption[] = [
  { id: 'cramps', label: 'Cramps', icon: '😣' },
  { id: 'headache', label: 'Headache', icon: '🤕' },
  { id: 'bloating', label: 'Bloating', icon: '😵' },
  { id: 'mood', label: 'Mood Changes', icon: '😢' },
  { id: 'fatigue', label: 'Fatigue', icon: '😴' },
  { id: 'backache', label: 'Back Pain', icon: '😖' },
  { id: 'breastache', label: 'Breast Pain', icon: '🤱' },
];

const SYMPTOMS_BY_ID = new Map(SYMPTOMS.map((symptom) => [symptom.id, symptom]));

/**
 * Label and icon for a symptom id, including ids from old backups that are no
 * longer in the current catalog.
 */
export function symptomMeta(id: string): SymptomOption {
  return (
    SYMPTOMS_BY_ID.get(id) ?? {
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      icon: '💊',
    }
  );
}
